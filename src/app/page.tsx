import { COMPONENTS_MAP, STATUS_LABEL, THE_CUT, type Status } from "@/lib/components-map";

const REPO = "https://github.com/lopamudrabareja12-web/aangan-receptionist";

const chip: Record<Status, string> = {
  built: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  planned: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  assumed: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
};

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <p className="text-sm font-medium text-zinc-500">MESA Case 03 · Aangan Studio · phone enquiries only</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Components Map</h1>
        <p className="mt-2 max-w-3xl text-zinc-600 dark:text-zinc-300">
          An AI phone receptionist answers every call at any hour. After each call, a pipeline qualifies the enquiry with
          Nikhil&apos;s own rules, then puts it into HubSpot with everything already asked, so designers never re-ask.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <span key={s} className={`rounded-full px-3 py-1 ${chip[s]}`}>{STATUS_LABEL[s]}</span>
          ))}
        </div>
      </header>

      <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {COMPONENTS_MAP.map((col) => (
          <li key={col.key} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">{col.title}</h2>
            <p className="mb-3 text-sm text-zinc-500">{col.summary}</p>
            <ul className="space-y-3">
              {col.items.map((it) => (
                <li key={it.text} className="text-sm leading-relaxed">
                  <span className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${chip[it.status]}`}>{STATUS_LABEL[it.status]}</span>
                  {it.text}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <section className="mt-8 rounded-xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900 dark:bg-rose-950/40">
        <h2 className="text-lg font-semibold">The Cut: what we chose not to build</h2>
        <p className="mt-1 text-sm"><span className="font-medium">Asked for:</span> {THE_CUT.asked}</p>
        <p className="mt-2 text-sm">{THE_CUT.verdict}</p>
      </section>

      <footer className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-zinc-200 pt-4 text-sm text-zinc-500 dark:border-zinc-800">
        <a className="underline" href={REPO}>Source code on GitHub</a>
        <span>Stack: Vaani, Next.js on Vercel, Supabase, Gemini, HubSpot</span>
      </footer>
    </main>
  );
}
