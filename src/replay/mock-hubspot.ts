import { PIPELINE_LABEL, STAGES } from "@/lib/hubspot/stages";

type Props = Record<string, string | number | undefined>;
interface Rec {
  id: string;
  properties: Props;
  associations?: unknown;
}

/**
 * In-memory imitation of the HubSpot endpoints we use. The Replay Lab and end-to-end tests talk to THIS, so
 * historical calls can never reach a real HubSpot portal. Pass `mock.fetch` to HubSpotClient.
 */
export class MockHubSpot {
  contacts: Rec[] = [];
  deals: Rec[] = [];
  notes: Rec[] = [];
  tasks: Rec[] = [];
  requests: { method: string; path: string }[] = [];
  /** simulate an outage: the next N requests fail with this status */
  failNext: { count: number; status: number } = { count: 0, status: 503 };
  private seq = 1000;

  readonly pipelineId = "mock-pipeline";
  readonly stageId = (key: string) => `mock-stage-${key}`;
  readonly stageKeyOf = (id: string | number | undefined) => STAGES.find((s) => this.stageId(s.key) === id)?.key;

  fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    const method = init?.method ?? "GET";
    this.requests.push({ method, path: u.pathname });
    if (this.failNext.count > 0) {
      this.failNext.count--;
      return new Response(JSON.stringify({ message: "simulated outage" }), { status: this.failNext.status });
    }
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    const create = (list: Rec[]) => {
      const r: Rec = { id: String(++this.seq), properties: body.properties ?? {}, associations: body.associations };
      list.push(r);
      return ok({ id: r.id, properties: r.properties });
    };
    const search = (list: Rec[]) => {
      const f = body.filterGroups?.[0]?.filters?.[0];
      const hits = list.filter((r) => String(r.properties[f.propertyName]) === String(f.value));
      return ok({ total: hits.length, results: hits.slice(0, 1).map((r) => ({ id: r.id, properties: r.properties })) });
    };

    switch (`${method} ${u.pathname}`) {
      case "GET /crm/v3/pipelines/deals":
        return ok({ results: [{ id: this.pipelineId, label: PIPELINE_LABEL, stages: STAGES.map((s) => ({ id: this.stageId(s.key), label: s.label })) }] });
      case "POST /crm/v3/objects/contacts/search": return search(this.contacts);
      case "POST /crm/v3/objects/contacts": return create(this.contacts);
      case "POST /crm/v3/objects/deals/search": return search(this.deals);
      case "POST /crm/v3/objects/deals": return create(this.deals);
      case "POST /crm/v3/objects/notes": return create(this.notes);
      case "POST /crm/v3/objects/tasks": return create(this.tasks);
      default:
        return new Response(JSON.stringify({ message: `mock has no route for ${method} ${u.pathname}` }), { status: 404 });
    }
  }) as typeof fetch;
}
