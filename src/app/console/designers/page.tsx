import { getDesigners } from "@/lib/console/queries";
import { toggleDuty } from "../actions";
import { btn, card, Notice, PageTitle } from "../ui";

export default async function Designers() {
  const list = await getDesigners();
  return (
    <>
      <PageTitle title="Designers" sub="Only designers who are on duty get the handoff email and can be auto-assigned." />
      <div className="mb-4"><Notice>Owners and open deals live in HubSpot. A designer must be linked to a HubSpot user to claim a lead. The HubSpot free plan allows 2 users; a real rollout needs a paid seat per designer.</Notice></div>
      <ul className="space-y-2">
        {list.map((d) => (
          <li key={d.id} className={`${card} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <p className="font-medium">{d.name}{d.isSenior ? <span className="ml-2 rounded bg-zinc-200 px-2 py-0.5 text-xs dark:bg-zinc-700">senior</span> : null}</p>
              <p className="text-sm text-zinc-500">{d.email} · {d.linked ? "linked to HubSpot" : "not linked to HubSpot (cannot claim)"}</p>
            </div>
            <form action={toggleDuty} className="flex items-center gap-3">
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="onDuty" value={String(!d.onDuty)} />
              <span className={`text-sm font-medium ${d.onDuty ? "text-emerald-700" : "text-zinc-500"}`}>{d.onDuty ? "On duty" : "Off duty"}</span>
              <button type="submit" className={btn}>{d.onDuty ? "Set off duty" : "Set on duty"}</button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
