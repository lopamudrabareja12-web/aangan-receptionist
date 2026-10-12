import Link from "next/link";
import { getDeclined } from "@/lib/console/queries";
import { reinstate } from "../actions";
import { btn, card, istTime, Notice, PageTitle, words } from "../ui";

export default async function DeclinedReview() {
  const rows = await getDeclined();
  return (
    <>
      <PageTitle title="Declined review" sub="Every automatic decline, with the reason and the full call. If one was wrong, reinstate it and the designers are emailed like any other lead." />
      {rows.length === 0 ? <Notice>Nothing to review. No live call has been declined.</Notice> : null}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{r.name ?? "Unknown caller"} <span className="text-sm font-normal text-zinc-500">{[r.location, r.phone].filter(Boolean).join(" · ")}</span></p>
                <p className="mt-1 text-sm"><span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-900">{words(r.reason) || "declined"}</span> <span className="text-zinc-600 dark:text-zinc-300">{r.detail}</span></p>
                {r.summary ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{r.summary}</p> : null}
                <p className="mt-2 text-xs text-zinc-500">{istTime(r.createdAt)} IST · <Link className="underline" href={`/console/calls/${r.callId}`}>read the transcript</Link></p>
              </div>
              <form action={reinstate}>
                <input type="hidden" name="leadId" value={r.id} />
                <button type="submit" className={btn} disabled={!r.synced} title={r.synced ? "Send this lead to the designers" : "Waiting for the HubSpot deal to be created (about a minute)"}>
                  {r.synced ? "Reinstate" : "Syncing…"}
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
