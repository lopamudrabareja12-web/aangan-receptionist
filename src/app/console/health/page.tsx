import Link from "next/link";
import { getHealth } from "@/lib/console/queries";
import { retryOutbox } from "../actions";
import { btn, card, istTime, Notice, PageTitle, td, th, Tile, words } from "../ui";

export default async function Health() {
  const h = await getHealth();
  const dead = h.outbox.dead ?? 0;
  return (
    <>
      <PageTitle title="Sync health" sub="Writes to HubSpot go through a queue that retries by itself. A write only lands here as dead after repeated failures or a permanent error." />
      {dead > 0 || h.stuckCalls.length > 0 ? <div className="mb-4"><Notice tone="error">{dead} dead write(s) and {h.stuckCalls.length} call(s) that did not finish. Details below.</Notice></div> : <div className="mb-4"><Notice>Everything is flowing: no dead writes and no stuck calls.</Notice></div>}
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Done" value={String(h.outbox.done ?? 0)} />
        <Tile label="Waiting" value={String(h.outbox.pending ?? 0)} sub="includes after-hours holds" />
        <Tile label="Dead" value={String(dead)} sub="needs a look" />
        <Tile label="Cancelled" value={String(h.outbox.cancelled ?? 0)} sub="dropped calls that were redialled" />
      </section>

      <section className={`${card} mb-6 overflow-x-auto`}>
        <h2 className="mb-2 text-sm font-semibold">Writes waiting or dead</h2>
        {h.problems.length === 0 ? <p className="text-sm text-zinc-500">None.</p> : (
          <table className="w-full min-w-[40rem] text-sm">
            <thead><tr><th className={th}>Operation</th><th className={th}>Status</th><th className={th}>Tries</th><th className={th}>Next try (IST)</th><th className={th}>Last error</th><th className={th} /></tr></thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {h.problems.map((p) => (
                <tr key={p.id}>
                  <td className={td}>{words(p.operation)}</td><td className={td}>{p.status}</td><td className={td}>{p.attempts}</td><td className={td}>{istTime(p.nextAttemptAt)}</td>
                  <td className={`${td} max-w-xs break-words text-zinc-600 dark:text-zinc-300`}>{p.lastError ?? ""}</td>
                  <td className={td}><form action={retryOutbox}><input type="hidden" name="id" value={p.id} /><button className={btn} type="submit">Retry now</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {h.stuckCalls.length > 0 ? (
        <section className={`${card} mb-6`}>
          <h2 className="mb-2 text-sm font-semibold">Calls that did not finish processing</h2>
          <ul className="space-y-1 text-sm">
            {h.stuckCalls.map((c) => <li key={c.id}><Link className="underline" href={`/console/calls/${c.id}`}>{istTime(c.createdAt)}</Link> · {c.status}{c.error ? ` · ${c.error}` : ""}</li>)}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">The every-minute job picks these up again by itself.</p>
        </section>
      ) : null}

      <section className={`${card} overflow-x-auto`}>
        <h2 className="mb-2 text-sm font-semibold">Latest HubSpot writes</h2>
        <table className="w-full min-w-[32rem] text-sm">
          <thead><tr><th className={th}>When (IST)</th><th className={th}>Operation</th><th className={th}>Result</th></tr></thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {h.recentSync.map((r, i) => <tr key={i}><td className={td}>{istTime(r.at)}</td><td className={td}>{words(r.operation)}</td><td className={td}>{r.ok ? "ok" : `failed${r.httpStatus ? ` (${r.httpStatus})` : ""}`}</td></tr>)}
          </tbody>
        </table>
      </section>
    </>
  );
}
