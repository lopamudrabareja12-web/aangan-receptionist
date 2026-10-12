import type { ReactNode } from "react";

export const decisionStyle: Record<string, string> = {
  qualified: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  qualified_flagged: "bg-lime-100 text-lime-900 dark:bg-lime-900/40 dark:text-lime-200",
  declined: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200",
  deferred: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  escalation: "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200",
  incomplete: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200",
};
export const decisionLabel: Record<string, string> = {
  qualified: "Qualified", qualified_flagged: "Qualified + flags", declined: "Declined (review)", deferred: "Deferred", escalation: "Escalation", incomplete: "Incomplete call",
};

export const card = "rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
export const th = "px-3 py-2 text-left text-xs uppercase text-zinc-500";
export const td = "px-3 py-2 align-top";
export const btn = "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

export function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={card}>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sub ? <p className="mt-1 text-xs text-zinc-500">{sub}</p> : null}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
  const t = { info: "border-sky-300 bg-sky-50 text-sky-950", warn: "border-amber-300 bg-amber-50 text-amber-950", error: "border-rose-300 bg-rose-50 text-rose-950" }[tone];
  return <div className={`rounded-lg border p-3 text-sm ${t}`}>{children}</div>;
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="mb-5">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {sub ? <p className="mt-1 text-sm text-zinc-500">{sub}</p> : null}
    </header>
  );
}

export const inrFull = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: v < 100 ? 2 : 0 })}`;
export const istTime = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(iso)) : "unknown";
export const words = (s: string | null) => (s ? s.replaceAll("_", " ") : "");
