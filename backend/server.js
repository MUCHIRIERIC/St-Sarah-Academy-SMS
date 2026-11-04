/**
 * St. Sarah's Academy — School Management System API (single file)
 * Motto: "A day attended is a Future Brightened"
 *
 * Install:  npm i express mongoose jsonwebtoken bcryptjs cors helmet dotenv
 * Run:      node server.js            (API on PORT, default 5000)
 * Seed:     node server.js --seed     (demo data; same logins as the front end)
 *
 * .env:
 *   MONGODB_URI=mongodb://127.0.0.1:27017/st_sarahs_academy
 *   JWT_SECRET=<long random string>        (REQUIRED in production)
 *   CLIENT_ORIGIN=http://localhost:3000    (comma-separated list allowed)
 *   PORT=5000
 */
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const helmet = require("helmet");
const crypto = require("crypto");

/* ───────────────────────────── Config ───────────────────────────── */

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/st_sarahs_academy";
const isProd = process.env.NODE_ENV === "production";
if (isProd && !process.env.JWT_SECRET) {
  console.error("JWT_SECRET must be set in production.");
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret-change-me";
const JWT_EXPIRES = "8h";
const VERSION = "1.0.0";

const SCHOOL = { name: "St. Sarah's Academy", motto: "A day attended is a Future Brightened" };
const CURRENT_YEAR = Number(process.env.ACADEMIC_YEAR || new Date().getFullYear());
const CURRENT_TERM = process.env.CURRENT_TERM || "Term 3";
const FEES = { tuition: 1200, activities: 100, boarding: 800 }; // per term — edit to suit
const CLASSES = ["Form 1A", "Form 1B", "Form 2A", "Form 3A"];
const SUBJECTS = ["Mathematics", "English", "Physics", "Chemistry", "Biology", "History", "Geography"];
const TERMS = ["Term 1", "Term 2", "Term 3"];
const ASSESSMENTS = ["Test 1", "Test 2", "Midterm", "End of Term"];

/* ───────────────────────────── Models ───────────────────────────── */

const { Schema, model } = mongoose;
const opts = { timestamps: true };

// Atomic sequence counters (admission numbers, receipt numbers).
const Counter = model("Counter", new Schema({ _id: String, seq: { type: Number, default: 0 } }));
async function nextSeq(name) {
  const c = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return c.seq;
}

const User = model("User", new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
  admissionNo: { type: String, unique: true, sparse: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["admin", "teacher", "student"], required: true },
  student: { type: Schema.Types.ObjectId, ref: "Student" },
  teacher: { type: Schema.Types.ObjectId, ref: "Teacher" },
  active: { type: Boolean, default: true },
}, opts));

const Dormitory = model("Dormitory", new Schema({
  name: { type: String, required: true, trim: true, unique: true },
  capacity: { type: Number, required: true, min: 1 },
  active: { type: Boolean, default: true },
}, opts));

const studentSchema = new Schema({
  admissionNo: { type: String, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  gender: { type: String, enum: ["M", "F"], required: true },
  className: { type: String, required: true },
  category: { type: String, enum: ["Boarding", "Day Scholar"], required: true },
  dormitory: { type: Schema.Types.ObjectId, ref: "Dormitory", default: null },
  guardian: { type: String, default: "" },
  phone: { type: String, default: "" },
}, opts);
// Business rule: Day Scholars never have a dormitory.
studentSchema.pre("validate", function (next) {
  if (this.category === "Day Scholar") this.dormitory = null;
  next();
});
const Student = model("Student", studentSchema);

const Department = model("Department", new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  hod: { type: Schema.Types.ObjectId, ref: "Teacher", default: null },
}, opts));

const Teacher = model("Teacher", new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, unique: true },
  department: { type: Schema.Types.ObjectId, ref: "Department" },
  subjects: [String],
  duties: [String],
}, opts));

// Gradebook: one document per student / subject / term / assessment.
const gradebookSchema = new Schema({
  student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
  subject: { type: String, required: true },
  term: { type: String, required: true },
  year: { type: Number, default: CURRENT_YEAR },
  type: { type: String, required: true },
  score: { type: Number, required: true, min: 0, max: 100 },
  grade: String,
  remark: { type: String, default: "" },
  enteredBy: { type: Schema.Types.ObjectId, ref: "User" },
}, opts);
gradebookSchema.index({ student: 1, subject: 1, term: 1, year: 1, type: 1 }, { unique: true });
const Gradebook = model("Gradebook", gradebookSchema);

// Finance ledger (payments + balance adjustments).
const Payment = model("Payment", new Schema({
  receiptNo: { type: String, unique: true, sparse: true },
  student: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
  kind: { type: String, enum: ["payment", "adjustment"], required: true },
  amount: { type: Number, required: true }, // adjustments may be negative (waivers)
  method: { type: String, default: "Cash" },
  note: { type: String, default: "" },
  term: { type: String, default: CURRENT_TERM },
  year: { type: Number, default: CURRENT_YEAR },
  recordedBy: { type: Schema.Types.ObjectId, ref: "User" },
}, opts));

/* ───────────────────────────── Helpers ───────────────────────────── */

const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = (msg) => new HttpError(400, msg);
const isId = (id) => mongoose.isValidObjectId(id);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => (a.length ? sum(a) / a.length : 0);
const r1 = (n) => Math.round(n * 10) / 10;
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

const gradeOf = (s) => (s >= 80 ? "A" : s >= 70 ? "B" : s >= 60 ? "C" : s >= 50 ? "D" : s >= 40 ? "E" : "U");
const remarkOf = (s) => (s >= 80 ? "Excellent work" : s >= 70 ? "Very good" : s >= 60 ? "Good effort" : s >= 50 ? "Satisfactory" : s >= 40 ? "Needs improvement" : "Requires urgent support");

const admissionNo = (seq) => `SSA/${CURRENT_YEAR}/${String(seq).padStart(4, "0")}`;
const feeBase = (category) => FEES.tuition + FEES.activities + (category === "Boarding" ? FEES.boarding : 0);

/** Fee position for many students at once: Map(studentId -> {...}). */
async function financials(students) {
  const ids = students.map((s) => s._id);
  const agg = await Payment.aggregate([
    { $match: { student: { $in: ids } } },
    { $group: { _id: { s: "$student", k: "$kind" }, total: { $sum: "$amount" } } },
  ]);
  const paid = new Map(); const adj = new Map();
  agg.forEach((a) => (a._id.k === "payment" ? paid : adj).set(String(a._id.s), a.total));
  return new Map(students.map((s) => {
    const p = paid.get(String(s._id)) || 0; const j = adj.get(String(s._id)) || 0;
    const boarding = s.category === "Boarding" ? FEES.boarding : 0;
    const total = FEES.tuition + FEES.activities + boarding + j;
    return [String(s._id), { tuition: FEES.tuition, activities: FEES.activities, boarding, adjustments: j, total, paid: p, balance: total - p }];
  }));
}

/** Validates a dormitory assignment (exists, active, has room). */
async function checkDorm(category, dormId, selfId) {
  if (category === "Day Scholar") return null;
  if (!dormId || !isId(dormId)) throw bad("Boarding students need a dormitory.");
  const d = await Dormitory.findById(dormId);
  if (!d) throw bad("Dormitory not found.");
  if (!d.active) throw bad(`${d.name} is disabled.`);
  const taken = await Student.countDocuments({ dormitory: d._id, ...(selfId ? { _id: { $ne: selfId } } : {}) });
  if (taken >= d.capacity) throw bad(`${d.name} is full.`);
  return d._id;
}

/** Term summary for one student: subject rows, overall average, class rank. */
async function termSummary(student, term, year = CURRENT_YEAR) {
  const mates = await Student.find({ className: student.className }).select("_id").lean();
  const rows = await Gradebook.find({ student: { $in: mates.map((m) => m._id) }, term, year }).lean();
  const perStudent = new Map();
  rows.forEach((r) => {
    const k = String(r.student);
    if (!perStudent.has(k)) perStudent.set(k, {});
    (perStudent.get(k)[r.subject] ||= []).push(r.score);
  });
  const overall = (k) => {
    const subs = Object.values(perStudent.get(k) || {}).map(mean);
    return subs.length ? mean(subs) : null;
  };
  const ranked = [...perStudent.keys()].map((k) => ({ k, o: overall(k) })).filter((x) => x.o !== null).sort((a, b) => b.o - a.o);
  const mine = rows.filter((r) => String(r.student) === String(student._id));
  const subjects = SUBJECTS.map((subject) => {
    const entries = mine.filter((r) => r.subject === subject);
    const avg = entries.length ? mean(entries.map((e) => e.score)) : null;
    return {
      subject, assessments: Object.fromEntries(entries.map((e) => [e.type, { score: e.score, grade: e.grade, remark: e.remark }])),
      average: avg === null ? null : r1(avg), grade: avg === null ? null : gradeOf(avg), remark: avg === null ? "" : remarkOf(avg),
    };
  });
  const o = overall(String(student._id));
  const idx = ranked.findIndex((r) => r.k === String(student._id));
  return { term, year, subjects, overallAverage: o === null ? null : r1(o), overallGrade: o === null ? null : gradeOf(o), rank: idx >= 0 ? idx + 1 : null, classSize: ranked.length };
}

/* ───────────────────────────── Auth middleware ───────────────────────────── */

const signToken = (u) => jwt.sign({ sub: String(u._id), role: u.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

const protect = asyncH(async (req, _res, next) => {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) throw new HttpError(401, "Not authenticated.");
  let payload;
  try { payload = jwt.verify(h.slice(7), JWT_SECRET); } catch { throw new HttpError(401, "Session expired or invalid token."); }
  const user = await User.findById(payload.sub);
  if (!user || !user.active) throw new HttpError(401, "Account not found or disabled.");
  req.user = user;
  next();
});
const allow = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, "You do not have permission to do that."));

// Tiny in-memory login throttle (use redis / express-rate-limit if you scale out).
const attempts = new Map();
const throttle = (req, _res, next) => {
  const key = req.ip; const now = Date.now();
  const rec = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (rec.length >= 10) return next(new HttpError(429, "Too many login attempts. Try again in 15 minutes."));
  rec.push(now); attempts.set(key, rec); next();
};

/* ───────────────────────────── App & routes ───────────────────────────── */

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: (process.env.CLIENT_ORIGIN || "http://localhost:3000").split(",").map((s) => s.trim()), credentials: true }));
app.use(express.json({ limit: "200kb" }));

const api = express.Router();
app.use("/api", api);

/* ---- Public ---- */
api.get("/health", (_req, res) =>
  res.json({ status: "ok", version: VERSION, school: SCHOOL, db: mongoose.connection.readyState === 1 ? "connected" : "disconnected", time: new Date().toISOString() }));

api.post("/auth/login", throttle, asyncH(async (req, res) => {
  const { identifier, email, password } = req.body || {};
  const id = String(identifier || email || "").trim();
  if (!id || !password) throw bad("Email/admission number and password are required.");
  const user = await User.findOne({ $or: [{ email: id.toLowerCase() }, { admissionNo: id.toUpperCase() }] }).select("+passwordHash");
  if (!user || !user.active || !(await bcrypt.compare(String(password), user.passwordHash))) throw new HttpError(401, "Invalid credentials.");
  res.json({ token: signToken(user), user: await publicUser(user) });
}));

async function publicUser(user) {
  const out = { id: user._id, name: user.name, email: user.email, role: user.role, userId: null };
  if (user.role === "student" && user.student) {
    const s = await Student.findById(user.student).populate("dormitory", "name");
    out.studentId = user.student; out.userId = s?.admissionNo; out.admissionNo = s?.admissionNo;
    out.category = s?.category; out.dormitory = s?.dormitory?.name || null; out.className = s?.className;
  } else if (user.role === "teacher") { out.teacherId = user.teacher; out.userId = `TCH-${String(user._id).slice(-5).toUpperCase()}`; }
  else out.userId = `ADM-${String(user._id).slice(-5).toUpperCase()}`;
  return out;
}

/* ---- Everything below needs a valid JWT ---- */
api.use(protect);

api.get("/auth/me", asyncH(async (req, res) => res.json({ user: await publicUser(req.user) })));

api.post("/auth/change-password", asyncH(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 8) throw bad("New password must be at least 8 characters.");
  const u = await User.findById(req.user._id).select("+passwordHash");
  if (!(await bcrypt.compare(String(currentPassword || ""), u.passwordHash))) throw new HttpError(401, "Current password is incorrect.");
  u.passwordHash = await bcrypt.hash(String(newPassword), 12); await u.save();
  res.json({ message: "Password updated." });
}));

/** Universal System Information page data — every role. */
api.get("/system/info", asyncH(async (req, res) => {
  const modules = {
    admin: ["Dashboard", "Students & Registration", "Staff & Duties", "Dormitories", "Financial Suite", "System Info"],
    teacher: ["Marks & Gradebook", "Duties & HoD", "Fee Balances", "System Info"],
    student: ["Dashboard", "Performance", "Fee Status", "System Info"],
  }[req.user.role];
  res.json({
    institution: { ...SCHOOL, academicYear: CURRENT_YEAR, term: CURRENT_TERM, email: process.env.SCHOOL_EMAIL, phone: process.env.SCHOOL_PHONE, address: process.env.SCHOOL_ADDRESS },
    user: await publicUser(req.user), sessionIssuedAt: jwt.decode(req.headers.authorization.slice(7))?.iat * 1000,
    modules, api: { status: "online", version: VERSION }, support: process.env.SUPPORT_EMAIL || "support@stsarahs.academy",
  });
}));

api.get("/meta", (_req, res) => res.json({ classes: CLASSES, subjects: SUBJECTS, terms: TERMS, assessments: ASSESSMENTS, fees: FEES, currentTerm: CURRENT_TERM, year: CURRENT_YEAR }));

/* ───────────── Admin: dashboard ───────────── */
api.get("/admin/dashboard", allow("admin"), asyncH(async (_req, res) => {
  const [students, teachers, dorms] = await Promise.all([Student.find().lean(), Teacher.countDocuments(), Dormitory.find().lean()]);
  const fin = await financials(students);
  const occ = await Student.aggregate([{ $match: { dormitory: { $ne: null } } }, { $group: { _id: "$dormitory", n: { $sum: 1 } } }]);
  const occMap = new Map(occ.map((o) => [String(o._id), o.n]));
  const boarding = students.filter((s) => s.category === "Boarding").length;
  const byClass = CLASSES.map((c) => {
    const ss = students.filter((s) => s.className === c);
    return { className: c, collected: sum(ss.map((s) => fin.get(String(s._id)).paid)), outstanding: sum(ss.map((s) => Math.max(fin.get(String(s._id)).balance, 0))) };
  });
  res.json({
    enrollment: { total: students.length, boarding, dayScholars: students.length - boarding }, activeTeachers: teachers,
    fees: { collected: sum([...fin.values()].map((f) => f.paid)), outstanding: sum([...fin.values()].map((f) => Math.max(f.balance, 0))), billed: sum([...fin.values()].map((f) => f.total)) },
    byClass, dormitories: dorms.map((d) => ({ id: d._id, name: d.name, capacity: d.capacity, active: d.active, occupied: occMap.get(String(d._id)) || 0 })),
  });
}));

/* ───────────── Students (admin CRUD) ───────────── */
api.get("/students", allow("admin", "teacher"), asyncH(async (req, res) => {
  const { q, category, className, page = 1, limit = 100 } = req.query;
  const f = {};
  if (category) f.category = category;
  if (className) f.className = className;
  if (q) { const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); f.$or = [{ name: rx }, { admissionNo: rx }]; }
  const lim = Math.min(Number(limit) || 100, 500);
  const [rows, total] = await Promise.all([
    Student.find(f).populate("dormitory", "name").sort({ admissionNo: 1 }).skip((Number(page) - 1) * lim).limit(lim).lean(),
    Student.countDocuments(f),
  ]);
  const fin = await financials(rows);
  // Teachers get class lists + balance only; admins also see guardian contact details.
  const data = rows.map((s) => ({
    ...(req.user.role === "teacher" ? pick(s, ["_id", "admissionNo", "name", "className", "category"]) : s),
    balance: fin.get(String(s._id)).balance,
  }));
  res.json({ total, page: Number(page), data });
}));

api.post("/students", allow("admin"), asyncH(async (req, res) => {
  const b = pick(req.body || {}, ["name", "gender", "className", "category", "dormitory", "guardian", "phone"]);
  if (!b.name || !b.gender || !b.className || !b.category) throw bad("name, gender, className and category are required.");
  if (!CLASSES.includes(b.className)) throw bad("Unknown class.");
  b.dormitory = await checkDorm(b.category, b.dormitory);
  // Atomic counter → unique, sequential admission numbers even under concurrent registrations.
  const seq = await nextSeq(`admission-${CURRENT_YEAR}`);
  const student = await Student.create({ ...b, admissionNo: admissionNo(seq) });
  // Create the student's login (admission number + one-time temporary password).
  const tempPassword = crypto.randomBytes(5).toString("hex");
  await User.create({ name: student.name, admissionNo: student.admissionNo, passwordHash: await bcrypt.hash(tempPassword, 12), role: "student", student: student._id });
  res.status(201).json({ student, login: { admissionNo: student.admissionNo, temporaryPassword: tempPassword, note: "Shown once — give to the student/guardian." } });
}));

api.get("/students/:id", allow("admin"), asyncH(async (req, res) => {
  if (!isId(req.params.id)) throw bad("Invalid id.");
  const s = await Student.findById(req.params.id).populate("dormitory", "name").lean();
  if (!s) throw new HttpError(404, "Student not found.");
  res.json({ ...s, fees: (await financials([s])).get(String(s._id)) });
}));

api.put("/students/:id", allow("admin"), asyncH(async (req, res) => {
  if (!isId(req.params.id)) throw bad("Invalid id.");
  const s = await Student.findById(req.params.id);
  if (!s) throw new HttpError(404, "Student not found.");
  const b = pick(req.body || {}, ["name", "gender", "className", "category", "dormitory", "guardian", "phone"]); // admissionNo is immutable
  if (b.className && !CLASSES.includes(b.className)) throw bad("Unknown class.");
  const category = b.category || s.category;
  const dorm = b.dormitory !== undefined ? b.dormitory : s.dormitory;
  b.dormitory = await checkDorm(category, dorm, s._id);
  s.set(b); await s.save();
  if (b.name) await User.updateOne({ student: s._id }, { name: b.name });
  res.json(s);
}));

api.delete("/students/:id", allow("admin"), asyncH(async (req, res) => {
  if (!isId(req.params.id)) throw bad("Invalid id.");
  const s = await Student.findByIdAndDelete(req.params.id);
  if (!s) throw new HttpError(404, "Student not found.");
  await Promise.all([Gradebook.deleteMany({ student: s._id }), Payment.deleteMany({ student: s._id }), User.deleteOne({ student: s._id })]);
  res.json({ message: "Student deleted." });
}));

/* ───────────── Dormitories (dynamic management) ───────────── */
api.get("/dormitories", allow("admin", "teacher"), asyncH(async (_req, res) => {
  const [dorms, occ] = await Promise.all([Dormitory.find().sort({ name: 1 }).lean(), Student.aggregate([{ $match: { dormitory: { $ne: null } } }, { $group: { _id: "$dormitory", n: { $sum: 1 } } }])]);
  const m = new Map(occ.map((o) => [String(o._id), o.n]));
  res.json(dorms.map((d) => ({ ...d, occupied: m.get(String(d._id)) || 0 })));
}));
api.post("/dormitories", allow("admin"), asyncH(async (req, res) => {
  const { name, capacity, active } = req.body || {};
  if (!name || !Number.isFinite(Number(capacity)) || Number(capacity) < 1) throw bad("Name and a capacity of at least 1 are required.");
  try { res.status(201).json(await Dormitory.create({ name, capacity: Number(capacity), active: active !== false })); }
  catch (e) { if (e.code === 11000) throw bad("A dormitory with that name already exists."); throw e; }
}));
api.put("/dormitories/:id", allow("admin"), asyncH(async (req, res) => {
  if (!isId(req.params.id)) throw bad("Invalid id.");
  const d = await Dormitory.findById(req.params.id);
  if (!d) throw new HttpError(404, "Dormitory not found.");
  const occupied = await Student.countDocuments({ dormitory: d._id });
  const { name, capacity, active } = req.body || {};
  if (capacity !== undefined) { if (Number(capacity) < Math.max(1, occupied)) throw bad(`${occupied} students live here — capacity can't be lower.`); d.capacity = Number(capacity); }
  if (active === false && occupied > 0) throw bad("Move residents out before disabling this dormitory.");
  if (active !== undefined) d.active = !!active;
  if (name) d.name = name;
  try { await d.save(); } catch (e) { if (e.code === 11000) throw bad("A dormitory with that name already exists."); throw e; }
  res.json(d);
}));
api.delete("/dormitories/:id", allow("admin"), asyncH(async (req, res) => {
  if (!isId(req.params.id)) throw bad("Invalid id.");
  if (await Student.exists({ dormitory: req.params.id })) throw bad("Dormitory has residents. Move them first (or disable instead).");
  await Dormitory.findByIdAndDelete(req.params.id);
  res.json({ message: "Dormitory deleted." });
}));

/* ───────────── Staff, duties & departments ───────────── */
api.get("/teachers", allow("admin", "teacher"), asyncH(async (_req, res) => {
  const [teachers, depts] = await Promise.all([Teacher.find().populate("department", "name").sort({ name: 1 }).lean(), Department.find().lean()]);
  res.json(teachers.map((t) => ({ ...t, hodOf: depts.filter((d) => String(d.hod) === String(t._id)).map((d) => d.name) })));
}));

api.post("/teachers", allow("admin"), asyncH(async (req, res) => {
  const b = pick(req.body || {}, ["name", "email", "department", "subjects"]);
  if (!b.name || !b.email) throw bad("name and email are required.");
  const tempPassword = crypto.randomBytes(5).toString("hex");
  const t = await Teacher.create(b);
  await User.create({ name: t.name, email: t.email, passwordHash: await bcrypt.hash(tempPassword, 12), role: "teacher", teacher: t._id });
  res.status(201).json({ teacher: t, login: { email: t.email, temporaryPassword: tempPassword } });
}));

api.post("/teachers/:id/duties", allow("admin"), asyncH(async (req, res) => {
  const duty = String(req.body?.duty || "").trim();
  if (!isId(req.params.id) || !duty) throw bad("A valid teacher id and duty are required.");
  const t = await Teacher.findByIdAndUpdate(req.params.id, { $addToSet: { duties: duty } }, { new: true });
  if (!t) throw new HttpError(404, "Teacher not found.");
  res.json(t);
}));
api.delete("/teachers/:id/duties", allow("admin"), asyncH(async (req, res) => {
  const duty = String(req.body?.duty || req.query.duty || "").trim();
  const t = await Teacher.findByIdAndUpdate(req.params.id, { $pull: { duties: duty } }, { new: true });
  if (!t) throw new HttpError(404, "Teacher not found.");
  res.json(t);
}));

api.get("/departments", allow("admin", "teacher"), asyncH(async (_req, res) => res.json(await Department.find().populate("hod", "name").lean())));
api.post("/departments", allow("admin"), asyncH(async (req, res) => {
  if (!req.body?.name) throw bad("Department name is required.");
  try { res.status(201).json(await Department.create({ name: req.body.name })); } catch (e) { if (e.code === 11000) throw bad("Department already exists."); throw e; }
}));
api.put("/departments/:id/hod", allow("admin"), asyncH(async (req, res) => {
  const { teacherId } = req.body || {};
  if (teacherId && !(await Teacher.exists({ _id: teacherId }))) throw bad("Teacher not found.");
  const d = await Department.findByIdAndUpdate(req.params.id, { hod: teacherId || null }, { new: true }).populate("hod", "name");
  if (!d) throw new HttpError(404, "Department not found.");
  res.json(d);
}));

/** Teacher: own duties + HoD responsibilities. */
api.get("/teacher/duties", allow("teacher"), asyncH(async (req, res) => {
  const t = await Teacher.findById(req.user.teacher).populate("department", "name").lean();
  if (!t) throw new HttpError(404, "Teacher profile not found.");
  const hodDepts = await Department.find({ hod: t._id }).lean();
  const departments = await Promise.all(hodDepts.map(async (d) => {
    const members = await Teacher.find({ department: d._id }).select("name subjects").lean();
    const subjects = [...new Set(members.flatMap((m) => m.subjects))];
    const scores = await Gradebook.aggregate([{ $match: { subject: { $in: subjects }, term: req.query.term || CURRENT_TERM } }, { $group: { _id: "$subject", mean: { $avg: "$score" } } }]);
    return { id: d._id, name: d.name, members, subjectMeans: scores.map((s) => ({ subject: s._id, mean: r1(s.mean) })) };
  }));
  res.json({ teacher: { id: t._id, name: t.name, department: t.department?.name, subjects: t.subjects }, duties: t.duties, headOf: departments });
}));

/* ───────────── Gradebook ───────────── */
api.get("/grades", allow("admin", "teacher"), asyncH(async (req, res) => {
  const { className, subject, term = CURRENT_TERM, type } = req.query;
  if (!className || !subject) throw bad("className and subject are required.");
  const students = await Student.find({ className }).sort({ admissionNo: 1 }).select("name admissionNo").lean();
  const marks = await Gradebook.find({ student: { $in: students.map((s) => s._id) }, subject, term, year: CURRENT_YEAR }).lean();
  res.json(students.map((s) => {
    const mine = marks.filter((m) => String(m.student) === String(s._id));
    const scores = mine.map((m) => m.score);
    return { student: s, current: type ? mine.find((m) => m.type === type) || null : null, total: sum(scores), average: scores.length ? r1(mean(scores)) : null, assessments: mine.map((m) => ({ type: m.type, score: m.score })) };
  }));
}));

/** Bulk upsert: { subject, term, type, entries:[{studentId, score, remark?}] } */
api.post("/grades", allow("teacher", "admin"), asyncH(async (req, res) => {
  const { subject, term, type, entries } = req.body || {};
  if (!SUBJECTS.includes(subject) || !TERMS.includes(term) || !ASSESSMENTS.includes(type)) throw bad("Valid subject, term and assessment type are required.");
  if (!Array.isArray(entries) || !entries.length) throw bad("No entries supplied.");
  if (req.user.role === "teacher") {
    const t = await Teacher.findById(req.user.teacher);
    if (!t || !t.subjects.includes(subject)) throw new HttpError(403, "You are not assigned to teach this subject.");
  }
  const ops = entries.map((e) => {
    const score = Number(e.score);
    if (!isId(e.studentId) || !Number.isFinite(score) || score < 0 || score > 100) throw bad("Each entry needs a studentId and a score between 0 and 100.");
    return {
      updateOne: {
        filter: { student: e.studentId, subject, term, year: CURRENT_YEAR, type },
        update: { $set: { score, grade: gradeOf(score), remark: (e.remark || "").trim() || remarkOf(score), enteredBy: req.user._id } },
        upsert: true,
      },
    };
  });
  const r = await Gradebook.bulkWrite(ops);
  res.json({ saved: entries.length, inserted: r.upsertedCount, updated: r.modifiedCount });
}));

/* ───────────── Finance ───────────── */
// Admin: full ledger
api.get("/finance/ledger", allow("admin"), asyncH(async (req, res) => {
  const f = {};
  if (req.query.student && isId(req.query.student)) f.student = req.query.student;
  const rows = await Payment.find(f).populate("student", "name admissionNo className").sort({ createdAt: -1 }).limit(Math.min(Number(req.query.limit) || 300, 1000)).lean();
  res.json(rows);
}));
api.get("/finance/summary", allow("admin"), asyncH(async (_req, res) => {
  const students = await Student.find().lean();
  const fin = await financials(students);
  const all = [...fin.values()];
  const billed = sum(all.map((x) => x.total)); const collected = sum(all.map((x) => x.paid));
  res.json({ billed, collected, outstanding: sum(all.map((x) => Math.max(x.balance, 0))), collectionRate: billed ? Math.round((collected / billed) * 100) : 0 });
}));
api.get("/finance/students", allow("admin"), asyncH(async (_req, res) => {
  const students = await Student.find().sort({ admissionNo: 1 }).lean();
  const fin = await financials(students);
  res.json(students.map((s) => ({ _id: s._id, admissionNo: s.admissionNo, name: s.name, className: s.className, category: s.category, ...fin.get(String(s._id)) })));
}));
api.post("/finance/payments", allow("admin"), asyncH(async (req, res) => {
  const { studentId, amount, method, note } = req.body || {};
  const amt = Number(amount);
  if (!isId(studentId) || !Number.isFinite(amt) || amt <= 0) throw bad("A valid student and a positive amount are required.");
  const s = await Student.findById(studentId);
  if (!s) throw new HttpError(404, "Student not found.");
  const bal = (await financials([s])).get(String(s._id)).balance;
  if (amt > bal) throw bad(`Amount exceeds the outstanding balance (${bal}).`);
  const receiptNo = `RCT-${String(await nextSeq("receipt")).padStart(5, "0")}`;
  const p = await Payment.create({ receiptNo, student: s._id, kind: "payment", amount: amt, method: method || "Cash", note: note || "Fee payment", recordedBy: req.user._id });
  res.status(201).json({ payment: p, receipt: { receiptNo, student: { name: s.name, admissionNo: s.admissionNo, className: s.className }, amount: amt, method: p.method, date: p.createdAt, balanceAfter: bal - amt, school: SCHOOL } });
}));
api.get("/finance/receipts/:receiptNo", allow("admin"), asyncH(async (req, res) => {
  const p = await Payment.findOne({ receiptNo: req.params.receiptNo }).populate("student", "name admissionNo className category");
  if (!p) throw new HttpError(404, "Receipt not found.");
  res.json({ receipt: p, school: SCHOOL });
}));
api.post("/finance/adjustments", allow("admin"), asyncH(async (req, res) => {
  const { studentId, amount, reason } = req.body || {};
  const amt = Number(amount);
  if (!isId(studentId) || !Number.isFinite(amt) || amt === 0 || !String(reason || "").trim()) throw bad("Student, a non-zero amount and a reason are required.");
  if (!(await Student.exists({ _id: studentId }))) throw new HttpError(404, "Student not found.");
  res.status(201).json(await Payment.create({ student: studentId, kind: "adjustment", amount: amt, method: "Adjustment", note: String(reason).trim(), recordedBy: req.user._id }));
}));

// Teacher: RESTRICTED — current balances only (no transactions, no reports).
api.get("/finance/balances", allow("teacher"), asyncH(async (req, res) => {
  const f = {};
  if (req.query.className) f.className = req.query.className;
  if (req.query.q) f.$or = [{ name: new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }, { admissionNo: new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }];
  const students = await Student.find(f).sort({ admissionNo: 1 }).lean();
  const fin = await financials(students);
  res.json(students.map((s) => { const b = fin.get(String(s._id)).balance; return { _id: s._id, admissionNo: s.admissionNo, name: s.name, className: s.className, balance: Math.max(b, 0), cleared: b <= 0 }; }));
}));

/* ───────────── Student self-service ───────────── */
const mineStudent = asyncH(async (req, _res, next) => {
  req.student = await Student.findById(req.user.student).populate("dormitory", "name");
  if (!req.student) throw new HttpError(404, "Student profile not found.");
  next();
});
api.get("/me/dashboard", allow("student"), mineStudent, asyncH(async (req, res) => {
  const s = req.student;
  const fin = (await financials([s])).get(String(s._id));
  const perf = await termSummary(s, req.query.term || CURRENT_TERM);
  res.json({ identity: { name: s.name, admissionNo: s.admissionNo, className: s.className, category: s.category, dormitory: s.dormitory?.name || null }, fees: fin, performance: { term: perf.term, overallAverage: perf.overallAverage, overallGrade: perf.overallGrade, rank: perf.rank, classSize: perf.classSize } });
}));
api.get("/me/performance", allow("student"), mineStudent, asyncH(async (req, res) => {
  const term = req.query.term || CURRENT_TERM;
  if (!TERMS.includes(term)) throw bad("Unknown term.");
  res.json(await termSummary(req.student, term));
}));
/** Official progress report (JSON — render/print on the client, or swap in a PDF generator). */
api.get("/me/report", allow("student"), mineStudent, asyncH(async (req, res) => {
  const term = req.query.term || CURRENT_TERM;
  const s = req.student;
  res.json({ school: SCHOOL, year: CURRENT_YEAR, student: { name: s.name, admissionNo: s.admissionNo, className: s.className, category: s.category, dormitory: s.dormitory?.name || null }, ...(await termSummary(s, term)), issuedAt: new Date().toISOString() });
}));
api.get("/me/fees", allow("student"), mineStudent, asyncH(async (req, res) => {
  const s = req.student;
  const fin = (await financials([s])).get(String(s._id));
  const ledger = await Payment.find({ student: s._id }).sort({ createdAt: -1 }).limit(20).lean();
  res.json({ summary: fin, status: fin.balance <= 0 ? "Paid in full" : fin.paid > 0 ? "Partially paid" : "Unpaid", invoices: ledger });
}));

/* ───────────── 404 + error handling ───────────── */
api.use((_req, _res, next) => next(new HttpError(404, "Route not found.")));
app.use((err, _req, res, _next) => {
  if (err.name === "ValidationError") return res.status(400).json({ error: Object.values(err.errors).map((e) => e.message).join(" ") });
  if (err.name === "CastError") return res.status(400).json({ error: "Invalid identifier." });
  if (err.code === 11000) return res.status(409).json({ error: "Duplicate value." });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON body." });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 && isProd ? "Internal server error." : err.message });
});

/* ───────────────────────────── Seed (node server.js --seed) ───────────────────────────── */

async function seed() {
  console.log("Seeding demo data (this wipes existing collections)…");
  await Promise.all([User, Student, Teacher, Department, Dormitory, Gradebook, Payment, Counter].map((m) => m.deleteMany({})));
  const hash = (p) => bcrypt.hash(p, 12);
  const dorms = await Dormitory.insertMany([
    { name: "St. Jude Hall", capacity: 6 }, { name: "Grace Dormitory", capacity: 6 }, { name: "St. Mary Hall", capacity: 4 }, { name: "Hope House", capacity: 8, active: false },
  ]);
  const depts = await Department.insertMany(["Mathematics", "Languages", "Sciences", "Humanities"].map((name) => ({ name })));
  const D = Object.fromEntries(depts.map((d) => [d.name, d]));
  const teachers = await Teacher.insertMany([
    { name: "Ms. Amara Johnson", email: "teacher@ssa.edu", department: D.Mathematics._id, subjects: ["Mathematics"], duties: ["Examinations Officer"] },
    { name: "Mr. David Clarke", email: "d.clarke@ssa.edu", department: D.Languages._id, subjects: ["English"], duties: ["Patron – Drama Club"] },
    { name: "Dr. Helen Parker", email: "h.parker@ssa.edu", department: D.Sciences._id, subjects: ["Physics", "Chemistry", "Biology"], duties: ["Sports Master"] },
    { name: "Mr. Samuel Rivers", email: "s.rivers@ssa.edu", department: D.Humanities._id, subjects: ["History", "Geography"], duties: [] },
  ]);
  await Department.updateOne({ _id: D.Mathematics._id }, { hod: teachers[0]._id });
  await Department.updateOne({ _id: D.Languages._id }, { hod: teachers[1]._id });
  await Department.updateOne({ _id: D.Sciences._id }, { hod: teachers[2]._id });
  await User.create([
    { name: "Principal Admin", email: "admin@ssa.edu", passwordHash: await hash("admin123"), role: "admin" },
    ...(await Promise.all(teachers.map(async (t, i) => ({ name: t.name, email: t.email, passwordHash: await hash(i === 0 ? "teacher123" : crypto.randomBytes(6).toString("hex")), role: "teacher", teacher: t._id })))),
  ]);
  const rows = [
    ["Liam Carter", "M", "Form 1A", "Boarding", 0], ["Sophia Bennett", "F", "Form 1A", "Day Scholar"], ["Noah Mensah", "M", "Form 1B", "Boarding", 0],
    ["Ava Thompson", "F", "Form 1B", "Boarding", 1], ["Ethan Brooks", "M", "Form 2A", "Day Scholar"], ["Mia Hughes", "F", "Form 2A", "Boarding", 1],
    ["Lucas Reid", "M", "Form 2A", "Boarding", 2], ["Isabella Moore", "F", "Form 3A", "Day Scholar"], ["Oliver Grant", "M", "Form 3A", "Boarding", 0],
    ["Amelia Foster", "F", "Form 3A", "Boarding", 2], ["James Nolan", "M", "Form 1A", "Day Scholar"], ["Grace Palmer", "F", "Form 1B", "Day Scholar"],
  ];
  const students = [];
  for (const [name, gender, className, category, d] of rows) {
    const s = await Student.create({ name, gender, className, category, dormitory: category === "Boarding" ? dorms[d]._id : null, admissionNo: admissionNo(await nextSeq(`admission-${CURRENT_YEAR}`)), guardian: `Guardian of ${name.split(" ")[0]}` });
    students.push(s);
    await User.create({ name, admissionNo: s.admissionNo, role: "student", student: s._id, passwordHash: await hash(students.length === 1 ? "student123" : crypto.randomBytes(6).toString("hex")) });
  }
  const marks = [];
  students.forEach((s) => {
    const ability = 45 + Math.random() * 40;
    SUBJECTS.forEach((subject) => {
      const base = ability + (Math.random() - 0.5) * 24;
      TERMS.forEach((term) => (term === "Term 3" ? ["Test 1"] : ["Test 1", "Midterm", "End of Term"]).forEach((type) => {
        const score = Math.max(8, Math.min(98, Math.round(base + (Math.random() - 0.5) * 14)));
        marks.push({ student: s._id, subject, term, year: CURRENT_YEAR, type, score, grade: gradeOf(score), remark: remarkOf(score) });
      }));
    });
  });
  await Gradebook.insertMany(marks);
  for (const [i, s] of students.entries()) {
    const amt = Math.round((feeBase(s.category) * (i === 0 ? 0.45 : [0.4, 0.7, 1, 1][i % 4])) / 50) * 50;
    await Payment.create({ receiptNo: `RCT-${String(await nextSeq("receipt")).padStart(5, "0")}`, student: s._id, kind: "payment", amount: amt, method: ["Cash", "Bank Transfer", "Mobile Money"][i % 3], note: "Term fees" });
  }
  console.log("Done. Logins: admin@ssa.edu / admin123 · teacher@ssa.edu / teacher123 · student: " + students[0].admissionNo + " / student123");
}

/* ───────────────────────────── Boot ───────────────────────────── */

async function start() {
  await mongoose.connect(MONGODB_URI);
  console.log("MongoDB connected");
  await Promise.all([User, Student, Gradebook, Payment].map((m) => m.init())); // build indexes
  if (process.argv.includes("--seed")) { await seed(); await mongoose.disconnect(); return; }
  const server = app.listen(PORT, () => console.log(`${SCHOOL.name} API v${VERSION} on :${PORT}`));
  const stop = () => server.close(() => mongoose.disconnect().then(() => process.exit(0)));
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
}
start().catch((e) => { console.error("Failed to start:", e.message); process.exit(1); });

module.exports = app;
