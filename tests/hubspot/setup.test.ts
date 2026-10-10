import { describe, it, expect } from "vitest";
import { HubSpotClient } from "@/lib/hubspot/client";
import { applyAction, checkAssociations, planSetup, type PortalState } from "@/lib/hubspot/setup";
import { DEAL_PROPERTIES } from "@/lib/hubspot/properties";
import { PIPELINE_LABEL, STAGES } from "@/lib/hubspot/stages";
import { fakeHubSpot, json } from "./fake";

const allProps = DEAL_PROPERTIES.map((p) => p.name);
const fresh: PortalState = { pipelines: [{ id: "default", label: "Sales Pipeline", stages: [{ label: "Appointment scheduled" }] }], propertyNames: ["dealname"] };

describe("planSetup", () => {
  it("a fresh portal plans every property plus a new pipeline, with a free-plan warning", () => {
    const plan = planSetup(fresh, { adoptDefault: false });
    expect(plan.actions.filter((a) => a.type === "create_property")).toHaveLength(DEAL_PROPERTIES.length);
    expect(plan.actions.some((a) => a.type === "create_pipeline")).toBe(true);
    expect(plan.warnings[0]).toMatch(/adopt-default/);
  });

  it("--adopt-default reuses the existing default pipeline instead of creating one", () => {
    const plan = planSetup(fresh, { adoptDefault: true });
    expect(plan.actions).toContainEqual({ type: "adopt_default_pipeline", pipelineId: "default" });
    expect(plan.actions.some((a) => a.type === "create_pipeline")).toBe(false);
  });

  it("is idempotent: a fully set-up portal plans nothing", () => {
    const done: PortalState = { pipelines: [{ id: "p", label: PIPELINE_LABEL, stages: STAGES.map((s) => ({ label: s.label })) }], propertyNames: allProps };
    expect(planSetup(done, { adoptDefault: false }).actions).toEqual([]);
  });

  it("only adds the missing stages and never plans a deletion", () => {
    const partial: PortalState = { pipelines: [{ id: "p", label: PIPELINE_LABEL, stages: [{ label: "Claimed" }, { label: "Legacy stage" }] }], propertyNames: allProps };
    const plan = planSetup(partial, { adoptDefault: false });
    expect(plan.actions).toHaveLength(1);
    const a = plan.actions[0];
    expect(a.type === "add_stages" && a.stages.length).toBe(STAGES.length - 1);
  });
});

describe("applyAction", () => {
  const mk = (routes: Parameters<typeof fakeHubSpot>[0]) => {
    const f = fakeHubSpot(routes);
    return { c: new HubSpotClient({ token: "t", fetch: f.fetchFn, sleep: async () => {} }), calls: f.calls };
  };

  it("creates the pipeline with string probabilities and side lanes kept open (1%)", async () => {
    const { c, calls } = mk({ "POST /crm/v3/pipelines/deals": () => ({ body: { id: "p" } }) });
    await applyAction(c, { type: "create_pipeline" });
    const stages = json(calls[0].body).stages;
    expect(stages).toHaveLength(14);
    expect(stages.find((s: { label: string }) => s.label === "Closed won").metadata.probability).toBe("1.00");
    expect(stages.find((s: { label: string }) => s.label === "Declined (review)").metadata.probability).toBe("0.01");
  });

  it("refuses to rewrite a default pipeline that already holds deals", async () => {
    const { c, calls } = mk({ "POST /crm/v3/objects/deals/search": () => ({ body: { total: 3, results: [] } }) });
    await expect(applyAction(c, { type: "adopt_default_pipeline", pipelineId: "default" })).rejects.toThrow(/already has 3 deal/);
    expect(calls.some((x) => x.method === "PUT")).toBe(false);
  });

  it("adopts an empty default pipeline with PUT", async () => {
    const { c, calls } = mk({
      "POST /crm/v3/objects/deals/search": () => ({ body: { total: 0, results: [] } }),
      "PUT /crm/v3/pipelines/deals/default": () => ({ body: {} }),
    });
    await applyAction(c, { type: "adopt_default_pipeline", pipelineId: "default" });
    expect(json(calls[1].body).label).toBe(PIPELINE_LABEL);
  });

  it("explains a refused second pipeline", async () => {
    const { c } = mk({ "POST /crm/v3/pipelines/deals": () => ({ status: 403, body: { message: "pipeline limit reached" } }) });
    await expect(applyAction(c, { type: "create_pipeline" })).rejects.toThrow(/--adopt-default/);
  });
});

describe("checkAssociations", () => {
  const ok = { results: [{ category: "HUBSPOT_DEFINED", typeId: 3 }, { category: "HUBSPOT_DEFINED", typeId: 214 }, { category: "HUBSPOT_DEFINED", typeId: 202 }, { category: "HUBSPOT_DEFINED", typeId: 216 }, { category: "HUBSPOT_DEFINED", typeId: 204 }] };
  const route = (body: unknown) => () => ({ body });
  it("passes when the portal reports the ids we use", async () => {
    const f = fakeHubSpot({
      "GET /crm/v4/associations/deals/contacts/labels": route(ok),
      "GET /crm/v4/associations/notes/deals/labels": route(ok),
      "GET /crm/v4/associations/notes/contacts/labels": route(ok),
      "GET /crm/v4/associations/tasks/deals/labels": route(ok),
      "GET /crm/v4/associations/tasks/contacts/labels": route(ok),
    });
    expect(await checkAssociations(new HubSpotClient({ token: "t", fetch: f.fetchFn }))).toEqual([]);
  });
  it("reports a mismatch", async () => {
    const bad = { results: [{ category: "HUBSPOT_DEFINED", typeId: 999 }] };
    const f = fakeHubSpot({
      "GET /crm/v4/associations/deals/contacts/labels": route(bad),
      "GET /crm/v4/associations/notes/deals/labels": route(ok),
      "GET /crm/v4/associations/notes/contacts/labels": route(ok),
      "GET /crm/v4/associations/tasks/deals/labels": route(ok),
      "GET /crm/v4/associations/tasks/contacts/labels": route(ok),
    });
    const p = await checkAssociations(new HubSpotClient({ token: "t", fetch: f.fetchFn }));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/deals -> contacts/);
  });
});
