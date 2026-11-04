"use client";

/**
 * St. Sarah's Academy — School Management System (single-file front end)
 * Motto: "A day attended is a Future Brightened"
 *
 * Needs:  npm i lucide-react recharts react-hot-toast
 * Drop in: app/page.tsx (Next.js App Router) — works with Tailwind v3 or v4, no config changes
 *          (dark mode + theming use CSS variables set on the root element).
 *
 * Demo logins (replace with POST /api/auth/login -> JWT later):
 *   admin@ssa.edu / admin123   teacher@ssa.edu / teacher123   student@ssa.edu / student123
 *
 * All data lives in the in-memory store below (useSchoolStore). Each action maps 1:1 to a REST
 * endpoint you can build later; the admission counter notes the atomic Mongo approach.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import {
  Activity, Award, BookOpen, Briefcase, Building2, ChevronDown, ChevronLeft, ChevronRight, ClipboardList,
  Download, GraduationCap, Info, LayoutDashboard, LayoutGrid, LogOut, Mail, MapPin, Menu, MoreHorizontal,
  Moon, Pencil, Phone, Plus, Printer, Receipt, RefreshCw, Save, Search, ShieldCheck, Sun, Table2, Trash2,
  TrendingUp, Users, Wallet, X,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

/* ───────────────────────────── Config & constants ───────────────────────────── */

const INSTITUTION = {
  name: "St. Sarah's Academy",
  motto: "A day attended is a Future Brightened",
  // TODO: replace these placeholders with the school's real details
  email: "info@stsarahs.academy",
  phone: "+000 000 000 000",
  address: "P.O. Box 000, Your Town",
  supportEmail: "support@stsarahs.academy",
};
const YEAR = 2026;
const CURRENT_TERM = "Term 3";
const VERSION = "v1.0.0";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";
const CURRENCY = "$";
const FEES = { tuition: 1200, activities: 100, boarding: 800 }; // per term

const CLASSES = ["Form 1A", "Form 1B", "Form 2A", "Form 3A"];
const SUBJECTS = ["Mathematics", "English", "Physics", "Chemistry", "Biology", "History", "Geography"];
const TERMS = ["Term 1", "Term 2", "Term 3"];
const ASSESSMENTS = ["Test 1", "Test 2", "Midterm", "End of Term"];
const DUTY_PRESETS = [
  "Sports Master", "Patron – Debate Club", "Patron – Drama Club", "Boarding Master",
  "Examinations Officer", "Discipline Master", "Librarian", "Careers Guidance",
];

/* ───────────────────────────── Types ───────────────────────────── */

type Role = "admin" | "teacher" | "student";
type Category = "Boarding" | "Day Scholar";
interface User { id: string; name: string; email: string; password: string; role: Role; refId?: string }
interface Dorm { id: string; name: string; capacity: number; active: boolean }
interface Student {
  id: string; admissionNo: string; name: string; gender: "M" | "F"; className: string;
  category: Category; dormId: string | null; guardian: string; phone: string;
}
interface Teacher { id: string; name: string; email: string; deptId: string; subjects: string[]; duties: string[] }
interface Dept { id: string; name: string; hodId: string | null }
interface Mark { studentId: string; subject: string; term: string; type: string; score: number; remark: string }
interface LedgerEntry {
  id: string; receiptNo: string | null; studentId: string; kind: "payment" | "adjustment";
  amount: number; method: string; date: string; note: string;
}

/* ───────────────────────────── Helpers ───────────────────────────── */

const money = (n: number) => `${n < 0 ? "-" : ""}${CURRENCY}${Math.abs(n).toLocaleString()}`;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;
const markKey = (m: { studentId: string; subject: string; term: string; type: string }) =>
  `${m.studentId}|${m.subject}|${m.term}|${m.type}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function gradeOf(score: number) {
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  if (score >= 40) return "E";
  return "U";
}
function remarkOf(score: number) {
  if (score >= 80) return "Excellent work";
  if (score >= 70) return "Very good";
  if (score >= 60) return "Good effort";
  if (score >= 50) return "Satisfactory";
  if (score >= 40) return "Needs improvement";
  return "Requires urgent support";
}
const gradeTone = (g: string): Tone => (g === "A" || g === "B" ? "green" : g === "C" || g === "D" ? "amber" : "red");

function openPrintable(title: string, body: string) {
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return toast.error("Please allow pop-ups to print.");
  w.document.write(`<html><head><title>${esc(title)}</title><style>
    body{font-family:system-ui,sans-serif;padding:32px;color:#0f172a}
    h1{margin:0;font-size:22px}.muted{color:#64748b;font-size:13px}
    table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;font-size:14px}
    th{background:#f1f5f9}.head{border-bottom:3px solid #1e3a8a;padding-bottom:12px;margin-bottom:16px}
    .total{font-size:18px;font-weight:700;margin-top:16px}
  </style></head><body>${body}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
const letterhead = () =>
  `<div class="head"><h1>${esc(INSTITUTION.name)}</h1><div class="muted">${esc(INSTITUTION.motto)}<br/>${esc(INSTITUTION.address)} · ${esc(INSTITUTION.phone)} · ${esc(INSTITUTION.email)}</div></div>`;

/* ───────────────────────────── Seed data ───────────────────────────── */

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED_DORMS: Dorm[] = [
  { id: "d1", name: "St. Jude Hall", capacity: 6, active: true },
  { id: "d2", name: "Grace Dormitory", capacity: 6, active: true },
  { id: "d3", name: "St. Mary Hall", capacity: 4, active: true },
  { id: "d4", name: "Hope House", capacity: 8, active: false },
];
const STUDENT_ROWS: [string, "M" | "F", string, Category, string | null][] = [
  ["Liam Carter", "M", "Form 1A", "Boarding", "d1"],
  ["Sophia Bennett", "F", "Form 1A", "Day Scholar", null],
  ["Noah Mensah", "M", "Form 1B", "Boarding", "d1"],
  ["Ava Thompson", "F", "Form 1B", "Boarding", "d2"],
  ["Ethan Brooks", "M", "Form 2A", "Day Scholar", null],
  ["Mia Hughes", "F", "Form 2A", "Boarding", "d2"],
  ["Lucas Reid", "M", "Form 2A", "Boarding", "d3"],
  ["Isabella Moore", "F", "Form 3A", "Day Scholar", null],
  ["Oliver Grant", "M", "Form 3A", "Boarding", "d1"],
  ["Amelia Foster", "F", "Form 3A", "Boarding", "d3"],
  ["James Nolan", "M", "Form 1A", "Day Scholar", null],
  ["Grace Palmer", "F", "Form 1B", "Day Scholar", null],
];
const SEED_STUDENTS: Student[] = STUDENT_ROWS.map(([name, gender, className, category, dormId], i) => ({
  id: `s${i + 1}`, admissionNo: `SSA/${YEAR}/${String(i + 1).padStart(4, "0")}`,
  name, gender, className, category, dormId, guardian: `Guardian of ${name.split(" ")[0]}`, phone: "+000 000 000 000",
}));
const SEED_TEACHERS: Teacher[] = [
  { id: "t1", name: "Ms. Amara Johnson", email: "teacher@ssa.edu", deptId: "dp1", subjects: ["Mathematics"], duties: ["Examinations Officer"] },
  { id: "t2", name: "Mr. David Clarke", email: "d.clarke@ssa.edu", deptId: "dp2", subjects: ["English"], duties: ["Patron – Drama Club"] },
  { id: "t3", name: "Dr. Helen Parker", email: "h.parker@ssa.edu", deptId: "dp3", subjects: ["Physics", "Chemistry", "Biology"], duties: ["Sports Master"] },
  { id: "t4", name: "Mr. Samuel Rivers", email: "s.rivers@ssa.edu", deptId: "dp4", subjects: ["History", "Geography"], duties: [] },
];
const SEED_DEPTS: Dept[] = [
  { id: "dp1", name: "Mathematics", hodId: "t1" },
  { id: "dp2", name: "Languages", hodId: "t2" },
  { id: "dp3", name: "Sciences", hodId: "t3" },
  { id: "dp4", name: "Humanities", hodId: null },
];
const SEED_USERS: User[] = [
  { id: "u1", name: "Principal Admin", email: "admin@ssa.edu", password: "admin123", role: "admin" },
  { id: "u2", name: "Ms. Amara Johnson", email: "teacher@ssa.edu", password: "teacher123", role: "teacher", refId: "t1" },
  { id: "u3", name: "Liam Carter", email: "student@ssa.edu", password: "student123", role: "student", refId: "s1" },
];
const SEED_MARKS: Mark[] = (() => {
  const rnd = mulberry(2026);
  const out: Mark[] = [];
  SEED_STUDENTS.forEach((s) => {
    const ability = 45 + rnd() * 40;
    SUBJECTS.forEach((sub) => {
      const subj = ability + (rnd() - 0.5) * 24;
      TERMS.forEach((term) => {
        const types = term === "Term 3" ? ["Test 1"] : ["Test 1", "Midterm", "End of Term"];
        types.forEach((type) => {
          const score = Math.max(8, Math.min(98, Math.round(subj + (rnd() - 0.5) * 14)));
          out.push({ studentId: s.id, subject: sub, term, type, score, remark: remarkOf(score) });
        });
      });
    });
  });
  return out;
})();
const SEED_LEDGER: LedgerEntry[] = (() => {
  const rnd = mulberry(7);
  const out: LedgerEntry[] = [];
  let n = 0;
  SEED_STUDENTS.forEach((s, i) => {
    const total = FEES.tuition + FEES.activities + (s.category === "Boarding" ? FEES.boarding : 0);
    const share = i === 0 ? 0.45 : [0.4, 0.7, 1, 1, 0.55][Math.floor(rnd() * 5)];
    const amt = Math.round((total * share) / 50) * 50;
    if (amt > 0) {
      n++;
      out.push({
        id: `l${n}`, receiptNo: `RCT-${String(n).padStart(4, "0")}`, studentId: s.id, kind: "payment",
        amount: amt, method: ["Cash", "Bank Transfer", "Mobile Money"][i % 3],
        date: `2026-0${(i % 3) + 8}-${String(5 + i).padStart(2, "0")}`, note: "Term fees",
      });
    }
  });
  return out;
})();

/* ───────────────────────────── Store (swap for API calls later) ───────────────────────────── */

function useSchoolStore() {
  const [students, setStudents] = useState<Student[]>(SEED_STUDENTS);
  const [dorms, setDorms] = useState<Dorm[]>(SEED_DORMS);
  const [teachers, setTeachers] = useState<Teacher[]>(SEED_TEACHERS);
  const [depts, setDepts] = useState<Dept[]>(SEED_DEPTS);
  const [marks, setMarks] = useState<Mark[]>(SEED_MARKS);
  const [ledger, setLedger] = useState<LedgerEntry[]>(SEED_LEDGER);
  // Server equivalent: Counter.findOneAndUpdate({_id:`admission-${YEAR}`},{$inc:{seq:1}},{upsert:true,new:true})
  // — a single atomic Mongo op, so concurrent registrations can never receive the same number.
  const seq = useRef(SEED_STUDENTS.length);
  const rct = useRef(SEED_LEDGER.length);

  const occ = useCallback((dormId: string) => students.filter((s) => s.dormId === dormId).length, [students]);

  const dormError = useCallback(
    (category: Category, dormId: string | null, selfId?: string): string | null => {
      if (category === "Day Scholar") return null;
      if (!dormId) return "Select a dormitory for boarding students.";
      const d = dorms.find((x) => x.id === dormId);
      if (!d) return "Dormitory not found.";
      const taken = students.filter((s) => s.dormId === dormId && s.id !== selfId).length;
      if (!d.active) return `${d.name} is disabled.`;
      if (taken >= d.capacity) return `${d.name} is full.`;
      return null;
    },
    [dorms, students],
  );

  const addStudent = (input: Omit<Student, "id" | "admissionNo">): Student => {
    seq.current += 1;
    const s: Student = {
      ...input, dormId: input.category === "Boarding" ? input.dormId : null,
      id: `s${Date.now()}${seq.current}`, admissionNo: `SSA/${YEAR}/${String(seq.current).padStart(4, "0")}`,
    };
    setStudents((p) => [...p, s]);
    return s;
  };
  const updateStudent = (id: string, patch: Partial<Student>) =>
    setStudents((p) => p.map((s) => {
      if (s.id !== id) return s;
      const n = { ...s, ...patch };
      if (n.category === "Day Scholar") n.dormId = null;
      return n;
    }));
  const deleteStudent = (id: string) => {
    setStudents((p) => p.filter((s) => s.id !== id));
    setMarks((p) => p.filter((m) => m.studentId !== id));
    setLedger((p) => p.filter((l) => l.studentId !== id));
  };

  const saveDorm = (d: Omit<Dorm, "id"> & { id?: string }) =>
    setDorms((p) => (d.id ? p.map((x) => (x.id === d.id ? { ...x, ...d } as Dorm : x)) : [...p, { ...d, id: `d${Date.now()}` }]));

  const assignDuty = (tid: string, duty: string) =>
    setTeachers((p) => p.map((t) => (t.id === tid && !t.duties.includes(duty) ? { ...t, duties: [...t.duties, duty] } : t)));
  const removeDuty = (tid: string, duty: string) =>
    setTeachers((p) => p.map((t) => (t.id === tid ? { ...t, duties: t.duties.filter((d) => d !== duty) } : t)));
  const setHod = (deptId: string, tid: string | null) => setDepts((p) => p.map((d) => (d.id === deptId ? { ...d, hodId: tid } : d)));
  const addDept = (name: string) => setDepts((p) => [...p, { id: `dp${Date.now()}`, name, hodId: null }]);

  const saveMarks = (entries: Mark[]) =>
    setMarks((prev) => {
      const map = new Map(prev.map((m) => [markKey(m), m]));
      entries.forEach((e) => map.set(markKey(e), e));
      return [...map.values()];
    });

  const fin = useCallback(
    (s: Student) => {
      const mine = ledger.filter((l) => l.studentId === s.id);
      const paid = sum(mine.filter((l) => l.kind === "payment").map((l) => l.amount));
      const adj = sum(mine.filter((l) => l.kind === "adjustment").map((l) => l.amount));
      const boarding = s.category === "Boarding" ? FEES.boarding : 0;
      const total = FEES.tuition + FEES.activities + boarding + adj;
      return { tuition: FEES.tuition, activities: FEES.activities, boarding, adj, paid, total, balance: total - paid };
    },
    [ledger],
  );

  const recordPayment = (studentId: string, amount: number, method: string, note: string): LedgerEntry => {
    rct.current += 1;
    const e: LedgerEntry = {
      id: `l${Date.now()}`, receiptNo: `RCT-${String(rct.current).padStart(4, "0")}`, studentId,
      kind: "payment", amount, method, date: todayStr(), note,
    };
    setLedger((p) => [e, ...p]);
    return e;
  };
  const adjustBalance = (studentId: string, delta: number, reason: string) =>
    setLedger((p) => [{ id: `l${Date.now()}`, receiptNo: null, studentId, kind: "adjustment", amount: delta, method: "Adjustment", date: todayStr(), note: reason }, ...p]);

  return {
    students, dorms, teachers, depts, marks, ledger, occ, dormError, addStudent, updateStudent, deleteStudent,
    saveDorm, assignDuty, removeDuty, setHod, addDept, saveMarks, fin, recordPayment, adjustBalance,
  };
}
type Store = ReturnType<typeof useSchoolStore>;
const StoreCtx = createContext<Store | null>(null);
const useStore = () => {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("Store missing");
  return c;
};

/** Per-student term summary: subject rows, overall average, class rank. */
function termSummary(marks: Mark[], students: Student[], studentId: string, term: string) {
  const avgFor = (sid: string, sub: string) => {
    const sc = marks.filter((m) => m.studentId === sid && m.subject === sub && m.term === term).map((m) => m.score);
    return sc.length ? mean(sc) : null;
  };
  const overallFor = (sid: string) => {
    const a = SUBJECTS.map((s) => avgFor(sid, s)).filter((x): x is number => x !== null);
    return a.length ? mean(a) : null;
  };
  const me = students.find((s) => s.id === studentId);
  const rows = SUBJECTS.map((sub) => {
    const byType = ASSESSMENTS.map((t) => marks.find((m) => m.studentId === studentId && m.subject === sub && m.term === term && m.type === t) ?? null);
    const avg = avgFor(studentId, sub);
    return { id: sub, subject: sub, byType, avg, grade: avg === null ? "–" : gradeOf(avg), remark: avg === null ? "" : remarkOf(avg) };
  });
  const overall = overallFor(studentId);
  const mates = students.filter((s) => s.className === me?.className)
    .map((s) => ({ id: s.id, o: overallFor(s.id) })).filter((x) => x.o !== null)
    .sort((a, b) => (b.o as number) - (a.o as number));
  const idx = mates.findIndex((m) => m.id === studentId);
  return { rows, overall, rank: idx >= 0 ? idx + 1 : null, size: mates.length };
}

/* ───────────────────────────── UI primitives ───────────────────────────── */

type Tone = "green" | "red" | "amber" | "blue" | "gray";
const toneCls: Record<Tone, string> = {
  green: "bg-emerald-500/15 text-emerald-600", red: "bg-rose-500/15 text-rose-500",
  amber: "bg-amber-500/15 text-amber-600", blue: "bg-indigo-500/15 text-indigo-500", gray: "bg-slate-500/15 text-slate-500",
};
const inputCls = "w-full min-h-[44px] rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--brand)] placeholder:text-[var(--muted)]";
const btnPrimary = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[var(--brandText)] transition hover:opacity-90 active:scale-[.98] disabled:opacity-50";
const btnGhost = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--bg)]";
const btnDanger = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700";
const iconBtn = "inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--bg)] hover:text-[var(--text)]";

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm ${className}`}>{children}</div>
);
const Badge = ({ tone = "gray", children }: { tone?: Tone; children: React.ReactNode }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneCls[tone]}`}>{children}</span>
);
const Sk = ({ className = "" }: { className?: string }) => <div className={`animate-pulse rounded-xl bg-[var(--border)] ${className}`} />;
const PageSkeleton = () => (
  <div className="space-y-4">
    <Sk className="h-8 w-48" />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Sk key={i} className="h-28" />)}</div>
    <Sk className="h-64" />
  </div>
);
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block space-y-1.5"><span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</span>{children}</label>
);
function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-xl font-bold sm:text-2xl">{title}</h1>{subtitle && <p className="text-sm text-[var(--muted)]">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
function StatCard({ label, value, sub, icon: Icon, tone = "blue" }: { label: string; value: React.ReactNode; sub?: string; icon: React.ElementType; tone?: Tone }) {
  return (
    <Card className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-xs font-medium text-[var(--muted)]">{label}</p><p className="mt-1 truncate text-2xl font-bold">{value}</p>{sub && <p className="mt-0.5 text-xs text-[var(--muted)]">{sub}</p>}</div>
      <span className={`rounded-xl p-2.5 ${toneCls[tone]}`}><Icon size={20} /></span>
    </Card>
  );
}
function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl sm:max-w-lg sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-5 py-3">
          <h2 className="font-bold">{title}</h2><button className={iconBtn} onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
function ConfirmDialog({ open, title, message, confirmLabel = "Delete", onConfirm, onCancel }: { open: boolean; title: string; message: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p className="text-sm text-[var(--muted)]">{message}</p>
      <div className="mt-5 flex justify-end gap-2"><button className={btnGhost} onClick={onCancel}>Cancel</button><button className={btnDanger} onClick={onConfirm}>{confirmLabel}</button></div>
    </Modal>
  );
}
function SearchBar({ value, onChange, placeholder = "Search…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative min-w-[200px] flex-1">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
      <input className={`${inputCls} pl-9`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
const Emblem = ({ size = 44 }: { size?: number }) => (
  <span className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-700 to-indigo-500 ring-2 ring-[var(--accent)]" style={{ width: size, height: size }}>
    <GraduationCap size={size * 0.55} color="#f2c14e" />
  </span>
);

/** Table on desktop, expandable cards on mobile. */
interface Col<T> { key: string; label: string; render: (r: T) => React.ReactNode; primary?: boolean }
function MobileCard<T extends { id: string }>({ row, cols, actions, alwaysOpen }: { row: T; cols: Col<T>[]; actions?: (r: T) => React.ReactNode; alwaysOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const primary = cols.find((c) => c.primary) ?? cols[0];
  const rest = cols.filter((c) => c !== primary);
  const show = open || alwaysOpen;
  return (
    <Card className="!p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 font-semibold">{primary.render(row)}</div>
        <div className="flex items-center">
          {actions?.(row)}
          {!alwaysOpen && <button className={iconBtn} onClick={() => setOpen(!open)} aria-label="Toggle details"><ChevronDown size={18} className={`transition ${open ? "rotate-180" : ""}`} /></button>}
        </div>
      </div>
      {show && (
        <dl className="mt-2 space-y-2 border-t border-[var(--border)] pt-2 text-sm">
          {rest.map((c) => (<div key={c.key} className="flex items-center justify-between gap-3"><dt className="text-[var(--muted)]">{c.label}</dt><dd className="min-w-0 text-right">{c.render(row)}</dd></div>))}
        </dl>
      )}
    </Card>
  );
}
function DataView<T extends { id: string }>({ rows, cols, view = "auto", actions, empty = "Nothing to show yet.", alwaysOpen = false }: {
  rows: T[]; cols: Col<T>[]; view?: "auto" | "table" | "cards"; actions?: (r: T) => React.ReactNode; empty?: string; alwaysOpen?: boolean;
}) {
  if (!rows.length) return <Card className="py-10 text-center text-sm text-[var(--muted)]">{empty}</Card>;
  const tableCls = view === "cards" ? "hidden" : view === "table" ? "block" : "hidden md:block";
  const cardsCls = view === "cards" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : view === "table" ? "hidden" : "grid gap-3 sm:grid-cols-2 md:hidden";
  return (
    <>
      <div className={`${tableCls} overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]`}>
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--bg)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>{cols.map((c) => <th key={c.key} className="whitespace-nowrap px-4 py-3 font-semibold">{c.label}</th>)}{actions && <th className="px-4 py-3" />}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--border)] hover:bg-[var(--bg)]/60">
                {cols.map((c) => <td key={c.key} className="px-4 py-3 align-middle">{c.render(r)}</td>)}
                {actions && <td className="whitespace-nowrap px-2 py-2 text-right">{actions(r)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={cardsCls}>{rows.map((r) => <MobileCard key={r.id} row={r} cols={cols} actions={actions} alwaysOpen={alwaysOpen} />)}</div>
    </>
  );
}

/* ───────────────────────────── Auth: Login + ProtectedRoute ───────────────────────────── */

function Login({ onLogin, dark, toggleDark }: { onLogin: (u: User) => void; dark: boolean; toggleDark: () => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Replace with: const { token, user } = await api.post("/auth/login", { email, password })
    const u = SEED_USERS.find((x) => x.email === email.trim().toLowerCase() && x.password === pw);
    if (!u) return toast.error("Invalid email or password.");
    toast.success(`Welcome, ${u.name}`);
    onLogin(u);
  };
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <button className={`${iconBtn} absolute right-4 top-4`} onClick={toggleDark} aria-label="Toggle theme">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
      <Card className="w-full max-w-md !p-6 sm:!p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <Emblem size={64} />
          <h1 className="mt-3 text-2xl font-bold">{INSTITUTION.name}</h1>
          <p className="mt-1 text-sm italic text-[var(--accent)]">“{INSTITUTION.motto}”</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email"><input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@ssa.edu" autoComplete="username" required /></Field>
          <Field label="Password"><input className={inputCls} type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" autoComplete="current-password" required /></Field>
          <button className={`${btnPrimary} w-full`} type="submit">Sign in</button>
        </form>
        <div className="mt-6 border-t border-[var(--border)] pt-4">
          <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Demo accounts</p>
          <div className="grid grid-cols-3 gap-2">
            {SEED_USERS.map((u) => (
              <button key={u.id} className={`${btnGhost} !px-2 capitalize`} onClick={() => { setEmail(u.email); setPw(u.password); }}>{u.role}</button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function ProtectedRoute({ user, roles, children }: { user: User | null; roles: Role[]; children: React.ReactNode }) {
  // With a real API this also verifies the JWT (exp / signature) before rendering.
  if (!user) return null;
  if (!roles.includes(user.role)) {
    return (
      <Card className="mx-auto mt-10 max-w-md text-center">
        <ShieldCheck className="mx-auto text-rose-500" size={36} />
        <h2 className="mt-2 text-lg font-bold">Access denied</h2>
        <p className="text-sm text-[var(--muted)]">Your role ({user.role}) can’t open this page.</p>
      </Card>
    );
  }
  return <>{children}</>;
}

/* ───────────────────────────── Admin pages ───────────────────────────── */

function AdminDashboard() {
  const { students, teachers, dorms, occ, fin, ledger } = useStore();
  const boarding = students.filter((s) => s.category === "Boarding").length;
  const collected = sum(ledger.filter((l) => l.kind === "payment").map((l) => l.amount));
  const outstanding = sum(students.map((s) => Math.max(fin(s).balance, 0)));
  const pie = [{ name: "Boarding", value: boarding }, { name: "Day Scholar", value: students.length - boarding }];
  const bars = CLASSES.map((c) => {
    const ss = students.filter((s) => s.className === c);
    return { name: c, Collected: sum(ss.map((s) => fin(s).paid)), Outstanding: sum(ss.map((s) => Math.max(fin(s).balance, 0))) };
  });
  const tip = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)" };
  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${INSTITUTION.name} · ${CURRENT_TERM}, ${YEAR}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total enrollment" value={students.length} sub={`${boarding} boarding · ${students.length - boarding} day`} icon={Users} />
        <StatCard label="Teaching staff" value={teachers.length} sub={`${teachers.filter((t) => t.duties.length).length} with duties`} icon={Briefcase} tone="amber" />
        <StatCard label="Fees collected" value={money(collected)} icon={Wallet} tone="green" />
        <StatCard label="Outstanding" value={money(outstanding)} icon={TrendingUp} tone="red" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="mb-2 font-semibold">Boarding vs Day</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  <Cell fill="#4f6bed" /><Cell fill="#d4a017" />
                </Pie>
                <Tooltip contentStyle={tip} /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <h3 className="mb-2 font-semibold">Fees by class</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b855" />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 12 }} /><YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <Tooltip contentStyle={tip} cursor={{ fill: "#94a3b822" }} /><Legend />
                <Bar dataKey="Collected" fill="#10b981" radius={[6, 6, 0, 0]} /><Bar dataKey="Outstanding" fill="#f43f5e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <Card className="mt-4">
        <h3 className="mb-3 font-semibold">Dormitory occupancy</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {dorms.map((d) => {
            const o = occ(d.id);
            return (
              <div key={d.id} className={d.active ? "" : "opacity-50"}>
                <div className="flex justify-between text-sm"><span className="font-medium">{d.name}</span><span className="text-[var(--muted)]">{o}/{d.capacity}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--border)]"><div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${Math.min(100, (o / Math.max(d.capacity, 1)) * 100)}%` }} /></div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

function StudentForm({ initial, onClose }: { initial?: Student; onClose: () => void }) {
  const { dorms, occ, dormError, addStudent, updateStudent } = useStore();
  const [f, setF] = useState({
    name: initial?.name ?? "", gender: (initial?.gender ?? "M") as "M" | "F", className: initial?.className ?? CLASSES[0],
    category: (initial?.category ?? "Day Scholar") as Category, dormId: initial?.dormId ?? "", guardian: initial?.guardian ?? "", phone: initial?.phone ?? "",
  });
  const availableDorms = dorms.filter((d) => d.active && (occ(d.id) < d.capacity || d.id === initial?.dormId));
  const setCategory = (category: Category) => setF((p) => ({ ...p, category, dormId: category === "Day Scholar" ? "" : p.dormId }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return toast.error("Student name is required.");
    const dormId = f.category === "Boarding" ? f.dormId || null : null;
    const err = dormError(f.category, dormId, initial?.id);
    if (err) return toast.error(err);
    const data = { ...f, name: f.name.trim(), dormId };
    if (initial) { updateStudent(initial.id, data); toast.success("Student updated."); }
    else { const s = addStudent(data); toast.success(`Registered ${s.name} — ${s.admissionNo}`); }
    onClose();
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      {initial ? <p className="text-sm text-[var(--muted)]">Admission No: <b className="text-[var(--text)]">{initial.admissionNo}</b></p>
        : <p className="rounded-xl bg-indigo-500/10 p-3 text-xs text-indigo-500">Admission number is generated automatically on save (format SSA/{YEAR}/XXXX).</p>}
      <Field label="Full name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Gender"><select className={inputCls} value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value as "M" | "F" })}><option value="M">Male</option><option value="F">Female</option></select></Field>
        <Field label="Class"><select className={inputCls} value={f.className} onChange={(e) => setF({ ...f, className: e.target.value })}>{CLASSES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <Field label="Category">
        <div className="grid grid-cols-2 gap-2">
          {(["Day Scholar", "Boarding"] as Category[]).map((c) => (
            <button type="button" key={c} onClick={() => setCategory(c)} className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold transition ${f.category === c ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brandText)]" : "border-[var(--border)]"}`}>{c}</button>
          ))}
        </div>
      </Field>
      {f.category === "Boarding" && (
        <Field label="Dormitory">
          <select className={inputCls} value={f.dormId} onChange={(e) => setF({ ...f, dormId: e.target.value })}>
            <option value="">Select dormitory…</option>
            {availableDorms.map((d) => <option key={d.id} value={d.id}>{d.name} ({occ(d.id)}/{d.capacity})</option>)}
          </select>
          {!availableDorms.length && <span className="text-xs text-rose-500">No dormitory with free space. Add or enlarge one in Dormitories.</span>}
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Guardian"><input className={inputCls} value={f.guardian} onChange={(e) => setF({ ...f, guardian: e.target.value })} /></Field>
        <Field label="Phone"><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" /></Field>
      </div>
      <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary}><Save size={16} />{initial ? "Save changes" : "Register student"}</button></div>
    </form>
  );
}

function StudentsPage() {
  const { students, dorms, deleteStudent, fin } = useStore();
  const [q, setQ] = useState(""); const [cat, setCat] = useState("all"); const [cls, setCls] = useState("all");
  const [view, setView] = useState<"table" | "cards">("table");
  const [editing, setEditing] = useState<Student | "new" | null>(null);
  const [del, setDel] = useState<Student | null>(null);
  const rows = useMemo(() => students.filter((s) =>
    (cat === "all" || s.category === cat) && (cls === "all" || s.className === cls) &&
    (s.name + s.admissionNo).toLowerCase().includes(q.toLowerCase())), [students, q, cat, cls]);
  const cols: Col<Student>[] = [
    { key: "name", label: "Student", primary: true, render: (s) => <div><div className="font-semibold">{s.name}</div><div className="text-xs text-[var(--muted)]">{s.admissionNo}</div></div> },
    { key: "class", label: "Class", render: (s) => s.className },
    { key: "cat", label: "Category", render: (s) => <Badge tone={s.category === "Boarding" ? "blue" : "gray"}>{s.category}</Badge> },
    { key: "dorm", label: "Dormitory", render: (s) => dorms.find((d) => d.id === s.dormId)?.name ?? "—" },
    { key: "guardian", label: "Guardian", render: (s) => s.guardian },
    { key: "bal", label: "Fee balance", render: (s) => { const b = fin(s).balance; return <Badge tone={b > 0 ? "red" : "green"}>{money(b)}</Badge>; } },
  ];
  return (
    <>
      <PageHeader title="Students & Registration" subtitle={`${rows.length} of ${students.length} students`} actions={<button className={btnPrimary} onClick={() => setEditing("new")}><Plus size={16} />Register student</button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBar value={q} onChange={setQ} placeholder="Search name or admission no…" />
        <select className={`${inputCls} !w-auto`} value={cat} onChange={(e) => setCat(e.target.value)}><option value="all">All categories</option><option>Boarding</option><option>Day Scholar</option></select>
        <select className={`${inputCls} !w-auto`} value={cls} onChange={(e) => setCls(e.target.value)}><option value="all">All classes</option>{CLASSES.map((c) => <option key={c}>{c}</option>)}</select>
        <div className="hidden rounded-xl border border-[var(--border)] p-1 md:flex">
          <button className={`${iconBtn} ${view === "table" ? "!bg-[var(--brand)] !text-[var(--brandText)]" : ""}`} onClick={() => setView("table")} aria-label="Table view"><Table2 size={18} /></button>
          <button className={`${iconBtn} ${view === "cards" ? "!bg-[var(--brand)] !text-[var(--brandText)]" : ""}`} onClick={() => setView("cards")} aria-label="Card view"><LayoutGrid size={18} /></button>
        </div>
      </div>
      <DataView rows={rows} cols={cols} view={view === "table" ? "auto" : "cards"} empty="No students match your filters."
        actions={(s) => <><button className={iconBtn} onClick={() => setEditing(s)} aria-label="Edit"><Pencil size={16} /></button><button className={iconBtn} onClick={() => setDel(s)} aria-label="Delete"><Trash2 size={16} /></button></>} />
      <Modal open={editing !== null} title={editing === "new" ? "Register student" : "Edit student"} onClose={() => setEditing(null)}>
        {editing !== null && <StudentForm initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      </Modal>
      <ConfirmDialog open={!!del} title="Delete student?" message={`This permanently removes ${del?.name} (${del?.admissionNo}) along with their marks and fee records.`}
        onCancel={() => setDel(null)} onConfirm={() => { if (del) { deleteStudent(del.id); toast.success("Student deleted."); } setDel(null); }} />
    </>
  );
}

function DormsPage() {
  const { dorms, occ, saveDorm } = useStore();
  const [editing, setEditing] = useState<Dorm | "new" | null>(null);
  const [f, setF] = useState({ name: "", capacity: "10", active: true });
  const open = (d: Dorm | "new") => {
    setF(d === "new" ? { name: "", capacity: "10", active: true } : { name: d.name, capacity: String(d.capacity), active: d.active });
    setEditing(d);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cap = parseInt(f.capacity, 10);
    const self = editing !== "new" && editing ? editing : null;
    if (!f.name.trim()) return toast.error("Dormitory name is required.");
    if (!Number.isFinite(cap) || cap < 1) return toast.error("Capacity must be at least 1.");
    if (dorms.some((d) => d.id !== self?.id && d.name.toLowerCase() === f.name.trim().toLowerCase())) return toast.error("A dormitory with that name exists.");
    if (self && cap < occ(self.id)) return toast.error(`${occ(self.id)} students live here — capacity can’t be lower.`);
    if (self && !f.active && occ(self.id) > 0) return toast.error("Move residents out before disabling this dormitory.");
    saveDorm({ id: self?.id, name: f.name.trim(), capacity: cap, active: f.active });
    toast.success(self ? "Dormitory updated." : "Dormitory added.");
    setEditing(null);
  };
  const toggle = (d: Dorm) => {
    if (d.active && occ(d.id) > 0) return toast.error("Move residents out before disabling this dormitory.");
    saveDorm({ ...d, active: !d.active });
    toast.success(d.active ? `${d.name} disabled.` : `${d.name} enabled.`);
  };
  return (
    <>
      <PageHeader title="Dormitories" subtitle="Add, rename, enable/disable and set capacity." actions={<button className={btnPrimary} onClick={() => open("new")}><Plus size={16} />Add dormitory</button>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {dorms.map((d) => {
          const o = occ(d.id);
          return (
            <Card key={d.id} className={d.active ? "" : "opacity-70"}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3"><span className="rounded-xl bg-indigo-500/15 p-2.5 text-indigo-500"><Building2 size={20} /></span><div><p className="font-semibold">{d.name}</p><Badge tone={d.active ? "green" : "gray"}>{d.active ? "Active" : "Disabled"}</Badge></div></div>
                <button className={iconBtn} onClick={() => open(d)} aria-label="Edit"><Pencil size={16} /></button>
              </div>
              <div className="mt-4 flex justify-between text-sm"><span className="text-[var(--muted)]">Occupancy</span><span className="font-semibold">{o} / {d.capacity}</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--border)]"><div className={`h-full rounded-full ${o >= d.capacity ? "bg-rose-500" : "bg-[var(--brand)]"}`} style={{ width: `${Math.min(100, (o / d.capacity) * 100)}%` }} /></div>
              <button className={`${btnGhost} mt-4 w-full`} onClick={() => toggle(d)}>{d.active ? "Disable" : "Enable"}</button>
            </Card>
          );
        })}
      </div>
      <Modal open={editing !== null} title={editing === "new" ? "Add dormitory" : "Edit dormitory"} onClose={() => setEditing(null)}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Capacity"><input className={inputCls} type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
          <label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Active (available for allocation)</label>
          <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={() => setEditing(null)}>Cancel</button><button className={btnPrimary}><Save size={16} />Save</button></div>
        </form>
      </Modal>
    </>
  );
}

function StaffPage() {
  const { teachers, depts, assignDuty, removeDuty, setHod, addDept } = useStore();
  const [target, setTarget] = useState<Teacher | null>(null);
  const [preset, setPreset] = useState(DUTY_PRESETS[0]);
  const [custom, setCustom] = useState("");
  const [newDept, setNewDept] = useState("");
  const cols: Col<Teacher>[] = [
    { key: "n", label: "Teacher", primary: true, render: (t) => <div><div className="font-semibold">{t.name}</div><div className="text-xs text-[var(--muted)]">{t.email}</div></div> },
    { key: "d", label: "Department", render: (t) => depts.find((d) => d.id === t.deptId)?.name ?? "—" },
    { key: "s", label: "Subjects", render: (t) => t.subjects.join(", ") },
    { key: "h", label: "HoD", render: (t) => { const h = depts.filter((d) => d.hodId === t.id); return h.length ? <Badge tone="amber">HoD {h.map((d) => d.name).join(", ")}</Badge> : "—"; } },
    { key: "du", label: "Duties", render: (t) => t.duties.length ? <div className="flex flex-wrap justify-end gap-1 md:justify-start">{t.duties.map((d) => <span key={d} className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 py-0.5 pl-2.5 pr-1 text-xs font-semibold text-indigo-500">{d}<button onClick={() => { removeDuty(t.id, d); toast.success("Duty removed."); }} aria-label={`Remove ${d}`} className="rounded-full p-0.5 hover:bg-indigo-500/20"><X size={12} /></button></span>)}</div> : <span className="text-[var(--muted)]">None</span> },
  ];
  const assign = () => {
    const duty = (custom.trim() || preset).trim();
    if (!target || !duty) return;
    if (target.duties.includes(duty)) return toast.error("Duty already assigned.");
    assignDuty(target.id, duty); toast.success(`${duty} assigned to ${target.name}.`); setTarget(null); setCustom("");
  };
  return (
    <>
      <PageHeader title="Staff & Duty Allocation" subtitle="Assign duties and designate Heads of Department." />
      <DataView rows={teachers} cols={cols} actions={(t) => <button className={btnGhost} onClick={() => setTarget(t)}><Plus size={14} />Duty</button>} />
      <h2 className="mb-3 mt-8 text-lg font-bold">Departments & Heads</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {depts.map((d) => (
          <Card key={d.id}>
            <p className="font-semibold">{d.name}</p>
            <p className="mb-2 text-xs text-[var(--muted)]">{teachers.filter((t) => t.deptId === d.id).length} teacher(s)</p>
            <Field label="Head of Department">
              <select className={inputCls} value={d.hodId ?? ""} onChange={(e) => { setHod(d.id, e.target.value || null); toast.success("HoD updated."); }}>
                <option value="">— Unassigned —</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
          </Card>
        ))}
        <Card className="flex flex-col justify-center gap-2">
          <input className={inputCls} placeholder="New department name" value={newDept} onChange={(e) => setNewDept(e.target.value)} />
          <button className={btnGhost} onClick={() => { if (!newDept.trim()) return; addDept(newDept.trim()); setNewDept(""); toast.success("Department added."); }}><Plus size={16} />Add department</button>
        </Card>
      </div>
      <Modal open={!!target} title={`Assign duty — ${target?.name ?? ""}`} onClose={() => setTarget(null)}>
        <div className="space-y-4">
          <Field label="Choose a duty"><select className={inputCls} value={preset} onChange={(e) => setPreset(e.target.value)}>{DUTY_PRESETS.map((d) => <option key={d}>{d}</option>)}</select></Field>
          <Field label="…or type a custom duty"><input className={inputCls} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Patron – Chess Club" /></Field>
          <div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setTarget(null)}>Cancel</button><button className={btnPrimary} onClick={assign}>Assign</button></div>
        </div>
      </Modal>
    </>
  );
}

function receiptHtml(e: LedgerEntry, s: Student | undefined, balance: number) {
  return `${letterhead()}<h2>Payment Receipt</h2>
  <table><tr><th>Receipt No</th><td>${esc(e.receiptNo ?? "")}</td><th>Date</th><td>${esc(e.date)}</td></tr>
  <tr><th>Student</th><td>${esc(s?.name ?? "")}</td><th>Admission No</th><td>${esc(s?.admissionNo ?? "")}</td></tr>
  <tr><th>Class</th><td>${esc(s?.className ?? "")}</td><th>Method</th><td>${esc(e.method)}</td></tr></table>
  <p class="total">Amount received: ${money(e.amount)}</p><p class="muted">Note: ${esc(e.note)} · Outstanding balance: ${money(balance)}</p>
  <p class="muted" style="margin-top:40px">Authorised signature: ______________________</p>`;
}

function FinancePage() {
  const { students, ledger, fin, recordPayment, adjustBalance } = useStore();
  const [tab, setTab] = useState<"ledger" | "fees">("ledger");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<"pay" | "adj" | null>(null);
  const [sid, setSid] = useState(""); const [amt, setAmt] = useState(""); const [method, setMethod] = useState("Cash"); const [note, setNote] = useState("");
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const collected = sum(ledger.filter((l) => l.kind === "payment").map((l) => l.amount));
  const billed = sum(students.map((s) => fin(s).total));
  const outstanding = sum(students.map((s) => Math.max(fin(s).balance, 0)));
  const rows = ledger.filter((l) => (byId.get(l.studentId)?.name ?? "").toLowerCase().includes(q.toLowerCase()) || (l.receiptNo ?? "").toLowerCase().includes(q.toLowerCase()));
  const feeRows = students.filter((s) => (s.name + s.admissionNo).toLowerCase().includes(q.toLowerCase()));
  const openModal = (m: "pay" | "adj") => { setSid(students[0]?.id ?? ""); setAmt(""); setNote(""); setMethod("Cash"); setModal(m); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = byId.get(sid); const n = parseFloat(amt);
    if (!s) return toast.error("Select a student.");
    if (!Number.isFinite(n) || n === 0) return toast.error("Enter a valid amount.");
    if (modal === "pay") {
      if (n < 0) return toast.error("Payment must be positive.");
      if (n > fin(s).balance) return toast.error(`Exceeds outstanding balance (${money(fin(s).balance)}).`);
      const entry = recordPayment(s.id, n, method, note || "Fee payment");
      toast.success(`Receipt ${entry.receiptNo} issued.`);
      openPrintable(`Receipt ${entry.receiptNo}`, receiptHtml(entry, s, fin(s).balance - n));
    } else {
      if (!note.trim()) return toast.error("A reason is required for adjustments.");
      adjustBalance(s.id, n, note.trim()); toast.success("Balance adjusted.");
    }
    setModal(null);
  };
  const ledgerCols: Col<LedgerEntry>[] = [
    { key: "date", label: "Date", primary: true, render: (l) => <div><div className="font-semibold">{byId.get(l.studentId)?.name ?? "—"}</div><div className="text-xs text-[var(--muted)]">{l.date}</div></div> },
    { key: "r", label: "Receipt", render: (l) => l.receiptNo ?? "—" },
    { key: "k", label: "Type", render: (l) => <Badge tone={l.kind === "payment" ? "green" : "amber"}>{l.kind}</Badge> },
    { key: "a", label: "Amount", render: (l) => <b className={l.amount < 0 ? "text-rose-500" : ""}>{money(l.amount)}</b> },
    { key: "m", label: "Method / note", render: (l) => `${l.method} · ${l.note}` },
  ];
  const feeCols: Col<Student>[] = [
    { key: "n", label: "Student", primary: true, render: (s) => <div><div className="font-semibold">{s.name}</div><div className="text-xs text-[var(--muted)]">{s.admissionNo}</div></div> },
    { key: "t", label: "Tuition", render: (s) => money(fin(s).tuition) },
    { key: "a", label: "Activities", render: (s) => money(fin(s).activities) },
    { key: "b", label: "Boarding", render: (s) => money(fin(s).boarding) },
    { key: "j", label: "Adjustments", render: (s) => money(fin(s).adj) },
    { key: "tot", label: "Total", render: (s) => money(fin(s).total) },
    { key: "p", label: "Paid", render: (s) => money(fin(s).paid) },
    { key: "bal", label: "Balance", render: (s) => <Badge tone={fin(s).balance > 0 ? "red" : "green"}>{money(fin(s).balance)}</Badge> },
  ];
  const selected = byId.get(sid);
  return (
    <>
      <PageHeader title="Financial Suite" subtitle={`Per-term fees · ${CURRENT_TERM}, ${YEAR}`}
        actions={<><button className={btnGhost} onClick={() => openModal("adj")}>Adjust balance</button><button className={btnPrimary} onClick={() => openModal("pay")}><Receipt size={16} />Record payment</button></>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total billed" value={money(billed)} icon={ClipboardList} />
        <StatCard label="Collected" value={money(collected)} icon={Wallet} tone="green" />
        <StatCard label="Outstanding" value={money(outstanding)} icon={TrendingUp} tone="red" />
        <StatCard label="Collection rate" value={`${billed ? Math.round((collected / billed) * 100) : 0}%`} icon={Award} tone="amber" />
      </div>
      <div className="my-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-[var(--border)] p-1">
          {(["ledger", "fees"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`min-h-[40px] rounded-lg px-4 text-sm font-semibold ${tab === t ? "bg-[var(--brand)] text-[var(--brandText)]" : "text-[var(--muted)]"}`}>{t === "ledger" ? "Ledger" : "Fee breakdown"}</button>)}
        </div>
        <SearchBar value={q} onChange={setQ} placeholder="Search student or receipt…" />
      </div>
      {tab === "ledger"
        ? <DataView rows={rows} cols={ledgerCols} empty="No transactions found." actions={(l) => l.receiptNo ? <button className={iconBtn} aria-label="Print receipt" onClick={() => { const s = byId.get(l.studentId); openPrintable(`Receipt ${l.receiptNo}`, receiptHtml(l, s, s ? fin(s).balance : 0)); }}><Printer size={16} /></button> : null} />
        : <DataView rows={feeRows} cols={feeCols} />}
      <Modal open={modal !== null} title={modal === "pay" ? "Record payment" : "Adjust balance"} onClose={() => setModal(null)}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Student"><select className={inputCls} value={sid} onChange={(e) => setSid(e.target.value)}>{students.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.admissionNo}</option>)}</select></Field>
          {selected && <p className="text-xs text-[var(--muted)]">Current balance: <b className="text-[var(--text)]">{money(fin(selected).balance)}</b></p>}
          <Field label={modal === "pay" ? "Amount" : "Amount (+ increases fees, − waives/reduces)"}><input className={inputCls} type="number" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
          {modal === "pay" && <Field label="Method"><select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}><option>Cash</option><option>Bank Transfer</option><option>Mobile Money</option><option>Cheque</option></select></Field>}
          <Field label={modal === "pay" ? "Note (optional)" : "Reason (required)"}><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={() => setModal(null)}>Cancel</button><button className={btnPrimary}>{modal === "pay" ? "Save & print receipt" : "Apply adjustment"}</button></div>
        </form>
      </Modal>
    </>
  );
}

/* ───────────────────────────── Teacher pages ───────────────────────────── */

function GradebookPage({ user }: { user: User }) {
  const { teachers, students, marks, saveMarks } = useStore();
  const me = teachers.find((t) => t.id === user.refId);
  const subjects = me?.subjects.length ? me.subjects : SUBJECTS;
  const [cls, setCls] = useState(CLASSES[0]); const [subject, setSubject] = useState(subjects[0]);
  const [term, setTerm] = useState(CURRENT_TERM); const [type, setType] = useState(ASSESSMENTS[0]);
  const [draft, setDraft] = useState<Record<string, { score: string; remark: string }>>({});
  const classStudents = useMemo(() => students.filter((s) => s.className === cls), [students, cls]);

  useEffect(() => {
    const d: Record<string, { score: string; remark: string }> = {};
    classStudents.forEach((s) => {
      const m = marks.find((x) => markKey(x) === markKey({ studentId: s.id, subject, term, type }));
      d[s.id] = { score: m ? String(m.score) : "", remark: m?.remark ?? "" };
    });
    setDraft(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls, subject, term, type, classStudents.length]);

  const setScore = (id: string, v: string) => {
    const n = parseFloat(v);
    setDraft((p) => ({ ...p, [id]: { score: v, remark: Number.isFinite(n) && n >= 0 && n <= 100 ? remarkOf(n) : p[id]?.remark ?? "" } }));
  };
  const stats = (id: string) => {
    const others = marks.filter((m) => m.studentId === id && m.subject === subject && m.term === term && m.type !== type).map((m) => m.score);
    const cur = parseFloat(draft[id]?.score ?? "");
    const all = Number.isFinite(cur) ? [...others, cur] : others;
    return { total: sum(all), avg: all.length ? mean(all) : null };
  };
  const save = () => {
    const entries: Mark[] = [];
    for (const s of classStudents) {
      const d = draft[s.id]; if (!d || d.score === "") continue;
      const n = parseFloat(d.score);
      if (!Number.isFinite(n) || n < 0 || n > 100) return toast.error(`Invalid mark for ${s.name} (0–100).`);
      entries.push({ studentId: s.id, subject, term, type, score: n, remark: d.remark || remarkOf(n) });
    }
    if (!entries.length) return toast.error("Enter at least one mark.");
    saveMarks(entries); toast.success(`${entries.length} mark(s) saved.`);
  };
  const classMean = mean(classStudents.map((s) => parseFloat(draft[s.id]?.score ?? "")).filter((n) => Number.isFinite(n)));
  const cols: Col<Student>[] = [
    { key: "n", label: "Student", primary: true, render: (s) => <div><div className="font-semibold">{s.name}</div><div className="text-xs text-[var(--muted)]">{s.admissionNo}</div></div> },
    { key: "sc", label: "Score /100", render: (s) => <input className={`${inputCls} !w-24 text-right`} type="number" min={0} max={100} inputMode="decimal" value={draft[s.id]?.score ?? ""} onChange={(e) => setScore(s.id, e.target.value)} /> },
    { key: "g", label: "Grade", render: (s) => { const n = parseFloat(draft[s.id]?.score ?? ""); return Number.isFinite(n) && n >= 0 && n <= 100 ? <Badge tone={gradeTone(gradeOf(n))}>{gradeOf(n)}</Badge> : "—"; } },
    { key: "t", label: "Term total", render: (s) => r1(stats(s.id).total) },
    { key: "a", label: "Term avg", render: (s) => { const a = stats(s.id).avg; return a === null ? "—" : r1(a); } },
    { key: "r", label: "Remark", render: (s) => <input className={`${inputCls} md:!w-56`} value={draft[s.id]?.remark ?? ""} onChange={(e) => setDraft((p) => ({ ...p, [s.id]: { ...p[s.id], remark: e.target.value } }))} placeholder="Teacher remark" /> },
  ];
  return (
    <>
      <PageHeader title="Marks & Gradebook" subtitle="Grades: A ≥80 · B ≥70 · C ≥60 · D ≥50 · E ≥40 · U <40" actions={<button className={btnPrimary} onClick={save}><Save size={16} />Save marks</button>} />
      <Card className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="Class"><select className={inputCls} value={cls} onChange={(e) => setCls(e.target.value)}>{CLASSES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Subject"><select className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)}>{subjects.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Term"><select className={inputCls} value={term} onChange={(e) => setTerm(e.target.value)}>{TERMS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Assessment"><select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>{ASSESSMENTS.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </Card>
      <p className="mb-3 text-sm text-[var(--muted)]">{classStudents.length} students · Class mean: <b className="text-[var(--text)]">{Number.isFinite(classMean) ? r1(classMean) : "—"}</b></p>
      <DataView rows={classStudents} cols={cols} alwaysOpen empty="No students in this class." />
    </>
  );
}

function DutiesPage({ user }: { user: User }) {
  const { teachers, depts, marks } = useStore();
  const [term, setTerm] = useState(CURRENT_TERM);
  const me = teachers.find((t) => t.id === user.refId);
  const myDept = depts.find((d) => d.id === me?.deptId);
  const hodOf = depts.filter((d) => d.hodId === me?.id);
  if (!me) return <Card>No teacher profile is linked to this account.</Card>;
  return (
    <>
      <PageHeader title="Duties & Department" subtitle={me.name} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold">Assigned duties</h3>
          {me.duties.length ? <ul className="space-y-2">{me.duties.map((d) => <li key={d} className="flex items-center gap-2 rounded-xl bg-[var(--bg)] p-3 text-sm"><ClipboardList size={16} className="text-indigo-500" />{d}</li>)}</ul> : <p className="text-sm text-[var(--muted)]">No duties assigned yet.</p>}
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold">Department</h3>
          <p className="text-sm">Department: <b>{myDept?.name ?? "—"}</b></p>
          <p className="mt-1 text-sm">Subjects: <b>{me.subjects.join(", ")}</b></p>
          <div className="mt-3">{hodOf.length ? <Badge tone="amber">Head of Department — {hodOf.map((d) => d.name).join(", ")}</Badge> : <Badge>Not a Head of Department</Badge>}</div>
        </Card>
      </div>
      {hodOf.map((d) => {
        const members = teachers.filter((t) => t.deptId === d.id);
        const subs = [...new Set(members.flatMap((t) => t.subjects))];
        return (
          <Card key={d.id} className="mt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">HoD dashboard — {d.name}</h3>
              <select className={`${inputCls} !w-auto`} value={term} onChange={(e) => setTerm(e.target.value)}>{TERMS.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {subs.map((sub) => { const sc = marks.filter((m) => m.subject === sub && m.term === term).map((m) => m.score);
                return <div key={sub} className="rounded-xl bg-[var(--bg)] p-3"><p className="text-sm text-[var(--muted)]">{sub} · mean score</p><p className="text-2xl font-bold">{sc.length ? r1(mean(sc)) : "—"}</p></div>; })}
            </div>
            <p className="mt-3 text-sm text-[var(--muted)]">Team: {members.map((m) => m.name).join(" · ")}</p>
          </Card>
        );
      })}
    </>
  );
}

function BalancesPage() {
  const { students, fin } = useStore();
  const [q, setQ] = useState(""); const [filter, setFilter] = useState("all");
  const rows = students.filter((s) => (s.name + s.admissionNo).toLowerCase().includes(q.toLowerCase()) && (filter === "all" || (filter === "cleared") === (fin(s).balance <= 0)));
  const cols: Col<Student>[] = [
    { key: "n", label: "Student", primary: true, render: (s) => <div><div className="font-semibold">{s.name}</div><div className="text-xs text-[var(--muted)]">{s.admissionNo}</div></div> },
    { key: "c", label: "Class", render: (s) => s.className },
    { key: "b", label: "Balance due", render: (s) => <b>{money(Math.max(fin(s).balance, 0))}</b> },
    { key: "s", label: "Clearance", render: (s) => <Badge tone={fin(s).balance <= 0 ? "green" : "red"}>{fin(s).balance <= 0 ? "Cleared" : "Owing"}</Badge> },
  ];
  return (
    <>
      <PageHeader title="Fee Balances" subtitle="Current balances only — for exam and event clearance." />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBar value={q} onChange={setQ} placeholder="Search student…" />
        <select className={`${inputCls} !w-auto`} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All</option><option value="cleared">Cleared</option><option value="owing">Owing</option></select>
      </div>
      <DataView rows={rows} cols={cols} alwaysOpen />
    </>
  );
}

/* ───────────────────────────── Student pages ───────────────────────────── */

function useMyStudent(user: User) {
  const store = useStore();
  const me = store.students.find((s) => s.id === user.refId);
  return { ...store, me, dormName: store.dorms.find((d) => d.id === me?.dormId)?.name };
}

function StudentDashboard({ user }: { user: User }) {
  const { me, dormName, marks, students, fin } = useMyStudent(user);
  if (!me) return <Card>No student profile is linked to this account.</Card>;
  const term = [...TERMS].reverse().find((t) => marks.some((m) => m.studentId === me.id && m.term === t)) ?? CURRENT_TERM;
  const sum_ = termSummary(marks, students, me.id, term);
  const f = fin(me);
  return (
    <>
      <PageHeader title={`Hello, ${me.name.split(" ")[0]} 👋`} subtitle={INSTITUTION.motto} />
      <Card className="flex flex-col gap-4 bg-gradient-to-br from-indigo-700 to-indigo-500 !border-0 text-white sm:flex-row sm:items-center">
        <Emblem size={64} />
        <div className="flex-1"><p className="text-xs uppercase tracking-widest opacity-80">{INSTITUTION.name} · Student ID</p><p className="text-2xl font-bold">{me.name}</p><p className="font-mono text-sm opacity-90">{me.admissionNo}</p></div>
        <div className="flex flex-wrap gap-2 text-sm"><span className="rounded-full bg-white/20 px-3 py-1">{me.className}</span><span className="rounded-full bg-white/20 px-3 py-1">{me.category}{me.category === "Boarding" && dormName ? ` · ${dormName}` : ""}</span></div>
      </Card>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`${term} average`} value={sum_.overall === null ? "—" : r1(sum_.overall)} sub={sum_.overall === null ? "" : `Grade ${gradeOf(sum_.overall)}`} icon={TrendingUp} tone="green" />
        <StatCard label="Class rank" value={sum_.rank ? `${sum_.rank} / ${sum_.size}` : "—"} sub={me.className} icon={Award} tone="amber" />
        <StatCard label="Fee balance" value={money(Math.max(f.balance, 0))} sub={f.balance <= 0 ? "Fully paid" : "Outstanding"} icon={Wallet} tone={f.balance <= 0 ? "green" : "red"} />
        <StatCard label="Category" value={me.category === "Boarding" ? "Boarder" : "Day"} sub={dormName ?? "No dormitory"} icon={Building2} />
      </div>
    </>
  );
}

function PerformancePage({ user }: { user: User }) {
  const { me, marks, students } = useMyStudent(user);
  const [term, setTerm] = useState("Term 2");
  if (!me) return <Card>No student profile is linked to this account.</Card>;
  const s = termSummary(marks, students, me.id, term);
  const cols: Col<(typeof s.rows)[number]>[] = [
    { key: "sub", label: "Subject", primary: true, render: (r) => r.subject },
    ...ASSESSMENTS.map((t, i) => ({ key: t, label: t, render: (r: (typeof s.rows)[number]) => r.byType[i]?.score ?? "—" })),
    { key: "avg", label: "Average", render: (r) => (r.avg === null ? "—" : r1(r.avg)) },
    { key: "g", label: "Grade", render: (r) => (r.grade === "–" ? "—" : <Badge tone={gradeTone(r.grade)}>{r.grade}</Badge>) },
    { key: "rm", label: "Remark", render: (r) => r.remark || "—" },
  ];
  const download = () => {
    if (s.overall === null) return toast.error("No marks recorded for this term yet.");
    openPrintable(`Progress report — ${me.name}`, `${letterhead()}<h2>Progress Report · ${esc(term)} ${YEAR}</h2>
      <p><b>${esc(me.name)}</b> · ${esc(me.admissionNo)} · ${esc(me.className)} · ${esc(me.category)}</p>
      <table><tr><th>Subject</th>${ASSESSMENTS.map((t) => `<th>${t}</th>`).join("")}<th>Average</th><th>Grade</th><th>Remark</th></tr>
      ${s.rows.map((r) => `<tr><td>${esc(r.subject)}</td>${r.byType.map((m) => `<td>${m?.score ?? "–"}</td>`).join("")}<td>${r.avg === null ? "–" : r1(r.avg)}</td><td>${r.grade}</td><td>${esc(r.remark)}</td></tr>`).join("")}</table>
      <p class="total">Overall average: ${r1(s.overall)} (${gradeOf(s.overall)}) · Class position: ${s.rank} of ${s.size}</p>
      <p class="muted" style="margin-top:40px">Class teacher: ____________  Principal: ____________</p>`);
  };
  return (
    <>
      <PageHeader title="Performance" subtitle="Termly marks and class standing." actions={<><select className={`${inputCls} !w-auto`} value={term} onChange={(e) => setTerm(e.target.value)}>{TERMS.map((t) => <option key={t}>{t}</option>)}</select><button className={btnPrimary} onClick={download}><Download size={16} />Progress report</button></>} />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="Average" value={s.overall === null ? "—" : r1(s.overall)} icon={TrendingUp} tone="green" />
        <StatCard label="Grade" value={s.overall === null ? "—" : gradeOf(s.overall)} icon={Award} tone="amber" />
        <StatCard label="Class rank" value={s.rank ? `${s.rank}/${s.size}` : "—"} icon={Users} />
      </div>
      <DataView rows={s.rows} cols={cols} />
    </>
  );
}

function FeesPage({ user }: { user: User }) {
  const { me, ledger, fin, students } = useMyStudent(user);
  if (!me) return <Card>No student profile is linked to this account.</Card>;
  const f = fin(me);
  const mine = ledger.filter((l) => l.studentId === me.id);
  const pct = f.total > 0 ? Math.min(100, (f.paid / f.total) * 100) : 100;
  const status = f.balance <= 0 ? { t: "green" as Tone, l: "Paid in full" } : f.paid > 0 ? { t: "amber" as Tone, l: "Partially paid" } : { t: "red" as Tone, l: "Unpaid" };
  const cols: Col<LedgerEntry>[] = [
    { key: "d", label: "Date", primary: true, render: (l) => `${l.date} · ${l.receiptNo ?? "Adjustment"}` },
    { key: "t", label: "Type", render: (l) => <Badge tone={l.kind === "payment" ? "green" : "amber"}>{l.kind}</Badge> },
    { key: "a", label: "Amount", render: (l) => <b>{money(l.amount)}</b> },
    { key: "m", label: "Details", render: (l) => `${l.method} · ${l.note}` },
  ];
  return (
    <>
      <PageHeader title="Fee Status" subtitle={`${CURRENT_TERM}, ${YEAR}`} actions={<Badge tone={status.t}>{status.l}</Badge>} />
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total fees" value={money(f.total)} icon={ClipboardList} />
        <StatCard label="Paid" value={money(f.paid)} icon={Wallet} tone="green" />
        <StatCard label="Balance due" value={money(Math.max(f.balance, 0))} icon={TrendingUp} tone={f.balance > 0 ? "red" : "green"} />
      </div>
      <Card className="mt-4">
        <div className="mb-1 flex justify-between text-sm"><span>Payment progress</span><b>{Math.round(pct)}%</b></div>
        <div className="h-3 overflow-hidden rounded-full bg-[var(--border)]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {[["Tuition", f.tuition], ["Activities", f.activities], ["Boarding", f.boarding], ["Adjustments", f.adj]].map(([k, v]) => <div key={k as string} className="flex justify-between rounded-xl bg-[var(--bg)] px-3 py-2"><dt className="text-[var(--muted)]">{k}</dt><dd className="font-semibold">{money(v as number)}</dd></div>)}
        </dl>
      </Card>
      <h2 className="mb-3 mt-6 font-bold">Recent invoices & receipts</h2>
      <DataView rows={mine} cols={cols} empty="No payments recorded yet."
        actions={(l) => l.receiptNo ? <button className={iconBtn} aria-label="Print receipt" onClick={() => openPrintable(`Receipt ${l.receiptNo}`, receiptHtml(l, students.find((s) => s.id === l.studentId), f.balance))}><Printer size={16} /></button> : null} />
    </>
  );
}

/* ───────────────────────────── System Info (all roles) ───────────────────────────── */

function useNow(ms = 1000) {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}
const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, "0")).join(":");
};

const MODULES: { title: string; desc: string; icon: React.ElementType; page: string; roles: Role[] }[] = [
  { title: "Dashboard", desc: "Enrollment, staff and fee analytics at a glance.", icon: LayoutDashboard, page: "dashboard", roles: ["admin", "student"] },
  { title: "Students & Registration", desc: "Register learners with auto admission numbers; full CRUD.", icon: Users, page: "students", roles: ["admin"] },
  { title: "Staff & Duties", desc: "Allocate duties and designate Heads of Department.", icon: Briefcase, page: "staff", roles: ["admin"] },
  { title: "Dormitories", desc: "Manage dorm names, capacity and availability.", icon: Building2, page: "dorms", roles: ["admin"] },
  { title: "Financial Suite", desc: "Ledger, payments, receipts and balance adjustments.", icon: Wallet, page: "finance", roles: ["admin"] },
  { title: "Marks & Gradebook", desc: "Capture marks by class, subject, term and assessment.", icon: BookOpen, page: "gradebook", roles: ["teacher"] },
  { title: "Duties & HoD", desc: "Your responsibilities and department overview.", icon: ClipboardList, page: "duties", roles: ["teacher"] },
  { title: "Fee Balances", desc: "Check current balances for exam/event clearance.", icon: Receipt, page: "balances", roles: ["teacher"] },
  { title: "Performance", desc: "Termly marks, class rank and printable report.", icon: TrendingUp, page: "performance", roles: ["student"] },
  { title: "Fee Status", desc: "Your balance, payments and invoice status.", icon: Wallet, page: "fees", roles: ["student"] },
];

function SystemInfoPage({ user, loginAt, go }: { user: User; loginAt: number; go: (p: string) => void }) {
  const { students, teachers } = useStore();
  const now = useNow();
  const [api, setApi] = useState<{ state: "checking" | "online" | "offline"; ms?: number }>({ state: "checking" });
  const ping = useCallback(async () => {
    setApi({ state: "checking" });
    const t0 = performance.now(); const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 4000);
    try { const r = await fetch(`${API_URL}/health`, { signal: ctl.signal }); setApi(r.ok ? { state: "online", ms: Math.round(performance.now() - t0) } : { state: "offline" }); }
    catch { setApi({ state: "offline" }); } finally { clearTimeout(to); }
  }, []);
  useEffect(() => { ping(); }, [ping]);

  const displayId = user.role === "student" ? students.find((s) => s.id === user.refId)?.admissionNo ?? "—"
    : user.role === "teacher" ? `TCH-${String(teachers.findIndex((t) => t.id === user.refId) + 1).padStart(3, "0")}` : "ADM-001";
  const roleTone: Tone = user.role === "admin" ? "red" : user.role === "teacher" ? "amber" : "blue";
  const dot = api.state === "online" ? "bg-emerald-500" : api.state === "checking" ? "bg-amber-400 animate-pulse" : "bg-slate-400";
  return (
    <>
      <PageHeader title="App Overview & System Info" subtitle="Everything about this platform, in one place." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-4"><Emblem size={64} /><div><h2 className="text-xl font-bold">{INSTITUTION.name}</h2><p className="text-sm italic text-[var(--accent)]">“{INSTITUTION.motto}”</p></div></div>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <p className="flex items-center gap-2"><Mail size={16} className="text-[var(--muted)]" />{INSTITUTION.email}</p>
            <p className="flex items-center gap-2"><Phone size={16} className="text-[var(--muted)]" />{INSTITUTION.phone}</p>
            <p className="flex items-center gap-2 sm:col-span-2"><MapPin size={16} className="text-[var(--muted)]" />{INSTITUTION.address}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2"><Badge tone="blue">Academic year {YEAR}</Badge><Badge tone="green">{CURRENT_TERM} · in session</Badge></div>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Your identity</p>
          <p className="mt-2 text-lg font-bold">{user.name}</p>
          <div className="mt-1"><Badge tone={roleTone}>{user.role.toUpperCase()}</Badge></div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-[var(--muted)]">{user.role === "student" ? "Admission No" : "User ID"}</dt><dd className="font-mono font-semibold">{displayId}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--muted)]">Session</dt><dd className="font-mono font-semibold">{fmtDuration(now - loginAt)}</dd></div>
          </dl>
        </Card>
      </div>
      <h2 className="mb-3 mt-6 text-lg font-bold">Modules available to you</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {MODULES.filter((m) => m.roles.includes(user.role)).map((m) => (
          <button key={m.page} onClick={() => go(m.page)} className="group text-left">
            <Card className="h-full transition group-hover:border-[var(--brand)] group-hover:shadow-md">
              <span className="inline-flex rounded-xl bg-indigo-500/15 p-2.5 text-indigo-500"><m.icon size={20} /></span>
              <p className="mt-3 font-semibold">{m.title}</p><p className="text-sm text-[var(--muted)]">{m.desc}</p>
            </Card>
          </button>
        ))}
        <Card className="h-full"><span className="inline-flex rounded-xl bg-emerald-500/15 p-2.5 text-emerald-500"><Info size={20} /></span><p className="mt-3 font-semibold">System Info</p><p className="text-sm text-[var(--muted)]">You’re here — platform details for every user.</p></Card>
      </div>
      <Card className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Activity size={20} className="text-[var(--muted)]" />
          <div><p className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
            {api.state === "online" ? `API online · ${api.ms}ms` : api.state === "checking" ? "Checking API…" : "API not connected · demo data"}</p>
            <p className="text-xs text-[var(--muted)]">Release {VERSION} · {API_URL}</p></div>
        </div>
        <div className="flex gap-2"><button className={btnGhost} onClick={ping}><RefreshCw size={14} />Re-check</button><a className={btnPrimary} href={`mailto:${INSTITUTION.supportEmail}?subject=${encodeURIComponent(`SSA support — ${user.name}`)}`}><Mail size={16} />Contact support</a></div>
      </Card>
    </>
  );
}

/* ───────────────────────────── Shell: navigation, layout, routing ───────────────────────────── */

interface NavItem { id: string; label: string; icon: React.ElementType }
const NAV: Record<Role, NavItem[]> = {
  admin: [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard }, { id: "students", label: "Students", icon: Users },
    { id: "staff", label: "Staff & Duties", icon: Briefcase }, { id: "dorms", label: "Dormitories", icon: Building2 },
    { id: "finance", label: "Finance", icon: Wallet }, { id: "system", label: "System Info", icon: Info },
  ],
  teacher: [
    { id: "gradebook", label: "Gradebook", icon: BookOpen }, { id: "duties", label: "Duties & HoD", icon: ClipboardList },
    { id: "balances", label: "Fee Balances", icon: Receipt }, { id: "system", label: "System Info", icon: Info },
  ],
  student: [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard }, { id: "performance", label: "Performance", icon: TrendingUp },
    { id: "fees", label: "Fee Status", icon: Wallet }, { id: "system", label: "System Info", icon: Info },
  ],
};
const PAGE_ROLES: Record<string, Role[]> = {
  dashboard: ["admin", "student"], students: ["admin"], staff: ["admin"], dorms: ["admin"], finance: ["admin"],
  gradebook: ["teacher"], duties: ["teacher"], balances: ["teacher"], performance: ["student"], fees: ["student"],
  system: ["admin", "teacher", "student"],
};

function renderPage(page: string, user: User, loginAt: number, go: (p: string) => void) {
  switch (page) {
    case "dashboard": return user.role === "admin" ? <AdminDashboard /> : <StudentDashboard user={user} />;
    case "students": return <StudentsPage />;
    case "staff": return <StaffPage />;
    case "dorms": return <DormsPage />;
    case "finance": return <FinancePage />;
    case "gradebook": return <GradebookPage user={user} />;
    case "duties": return <DutiesPage user={user} />;
    case "balances": return <BalancesPage />;
    case "performance": return <PerformancePage user={user} />;
    case "fees": return <FeesPage user={user} />;
    default: return <SystemInfoPage user={user} loginAt={loginAt} go={go} />;
  }
}

function Shell({ user, loginAt, dark, toggleDark, onLogout }: { user: User; loginAt: number; dark: boolean; toggleDark: () => void; onLogout: () => void }) {
  const nav = NAV[user.role];
  const [page, setPage] = useState(nav[0].id);
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); const t = setTimeout(() => setLoading(false), 450); return () => clearTimeout(t); }, [page]);
  const go = (p: string) => { setPage(p); setDrawer(false); window.scrollTo({ top: 0 }); };
  const current = nav.find((n) => n.id === page);
  const bottom = nav.length <= 4 ? nav : nav.slice(0, 4);

  const NavButton = ({ n, expanded }: { n: NavItem; expanded: boolean }) => (
    <button onClick={() => go(n.id)} title={n.label} className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${page === n.id ? "bg-[var(--brand)] text-[var(--brandText)]" : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]"}`}>
      <n.icon size={20} className="shrink-0" />{expanded && <span className="truncate">{n.label}</span>}
    </button>
  );
  const Brand = ({ small }: { small?: boolean }) => (
    <div className="flex items-center gap-3 overflow-hidden"><Emblem size={40} />{!small && <div className="min-w-0"><p className="truncate text-sm font-bold leading-tight">{INSTITUTION.name}</p><p className="truncate text-[11px] text-[var(--muted)]">{CURRENT_TERM} · {YEAR}</p></div>}</div>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-[var(--border)] bg-[var(--card)] p-3 transition-all md:flex ${collapsed ? "w-[76px]" : "w-64"}`}>
        <div className="px-1 py-2"><Brand small={collapsed} /></div>
        <nav className="mt-4 flex-1 space-y-1">{nav.map((n) => <NavButton key={n.id} n={n} expanded={!collapsed} />)}</nav>
        {!collapsed && <p className="mb-2 px-2 text-[11px] italic leading-snug text-[var(--accent)]">“{INSTITUTION.motto}”</p>}
        <button className={`${btnGhost} w-full`} onClick={() => setCollapsed(!collapsed)} aria-label="Collapse sidebar">{collapsed ? <ChevronRight size={18} /> : <><ChevronLeft size={18} />Collapse</>}</button>
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/55" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[var(--card)] p-4 shadow-2xl">
            <div className="flex items-center justify-between"><Brand /><button className={iconBtn} onClick={() => setDrawer(false)} aria-label="Close menu"><X size={18} /></button></div>
            <nav className="mt-6 flex-1 space-y-1">{nav.map((n) => <NavButton key={n.id} n={n} expanded />)}</nav>
            <p className="mb-3 text-xs italic text-[var(--accent)]">“{INSTITUTION.motto}”</p>
            <button className={`${btnGhost} w-full`} onClick={onLogout}><LogOut size={16} />Sign out</button>
          </div>
        </div>
      )}

      <div className={`transition-all ${collapsed ? "md:pl-[76px]" : "md:pl-64"}`}>
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--glass)] px-3 py-2 backdrop-blur-xl sm:px-6">
          <button className={`${iconBtn} md:hidden`} onClick={() => setDrawer(true)} aria-label="Open menu"><Menu size={20} /></button>
          <h2 className="flex-1 truncate font-bold">{current?.label}</h2>
          <div className="hidden text-right leading-tight sm:block"><p className="text-sm font-semibold">{user.name}</p><p className="text-[11px] capitalize text-[var(--muted)]">{user.role}</p></div>
          <button className={iconBtn} onClick={toggleDark} aria-label="Toggle theme">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button className={`${iconBtn} hidden md:inline-flex`} onClick={onLogout} aria-label="Sign out"><LogOut size={18} /></button>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 md:pb-10">
          {loading ? <PageSkeleton /> : (
            <ProtectedRoute user={user} roles={PAGE_ROLES[page] ?? []}>{renderPage(page, user, loginAt, go)}</ProtectedRoute>
          )}
        </main>
      </div>

      {/* Mobile glass bottom nav */}
      <nav className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-1.5 shadow-xl backdrop-blur-xl md:hidden">
        {bottom.map((n) => (
          <button key={n.id} onClick={() => go(n.id)} className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold transition ${page === n.id ? "bg-[var(--brand)] text-[var(--brandText)]" : "text-[var(--muted)]"}`}>
            <n.icon size={20} /><span className="max-w-full truncate px-1">{n.label.split(" ")[0]}</span>
          </button>
        ))}
        {nav.length > 4 && <button onClick={() => setDrawer(true)} className="flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold text-[var(--muted)]"><MoreHorizontal size={20} />More</button>}
      </nav>
    </div>
  );
}

/* ───────────────────────────── Root ───────────────────────────── */

const THEMES = {
  light: { "--bg": "#f4f6fb", "--card": "#ffffff", "--text": "#0f172a", "--muted": "#64748b", "--border": "#e2e8f0", "--brand": "#1e3a8a", "--brandText": "#ffffff", "--accent": "#b8860b", "--glass": "rgba(255,255,255,.78)" },
  dark: { "--bg": "#0b1020", "--card": "#131a2e", "--text": "#e8ecf7", "--muted": "#94a3b8", "--border": "#243049", "--brand": "#7c93ff", "--brandText": "#0b1020", "--accent": "#f2c14e", "--glass": "rgba(19,26,46,.72)" },
};

export default function SchoolSystemPage() {
  const store = useSchoolStore();
  const [user, setUser] = useState<User | null>(null);
  const [loginAt, setLoginAt] = useState(0);
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false); }, []);

  return (
    <StoreCtx.Provider value={store}>
      <div style={THEMES[dark ? "dark" : "light"] as React.CSSProperties} className="min-h-screen bg-[var(--bg)] text-[var(--text)] antialiased">
        <Toaster position="top-center" toastOptions={{ style: { background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" } }} />
        {user ? (
          <Shell key={user.id} user={user} loginAt={loginAt} dark={dark} toggleDark={() => setDark(!dark)} onLogout={() => { setUser(null); toast("Signed out."); }} />
        ) : (
          <Login dark={dark} toggleDark={() => setDark(!dark)} onLogin={(u) => { setUser(u); setLoginAt(Date.now()); }} />
        )}
      </div>
    </StoreCtx.Provider>
  );
}
