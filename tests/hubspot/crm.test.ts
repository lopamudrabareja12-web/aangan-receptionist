import { describe, it, expect } from "vitest";
import { HubSpotClient } from "@/lib/hubspot/client";
import { addNote, createTask, listOwners, resolveStageIds, upsertContact, upsertDeal } from "@/lib/hubspot/crm";
import { PIPELINE_LABEL, STAGES } from "@/lib/hubspot/stages";
import { fakeHubSpot, json } from "./fake";

const client = (routes: Parameters<typeof fakeHubSpot>[0]) => {
  const f = fakeHubSpot(routes);
  return { c: new HubSpotClient({ token: "t", fetch: f.fetchFn, sleep: async () => {} }), calls: f.calls };
};

describe("upsertContact", () => {
  it("creates a contact with the normalised E.164 phone when none exists", async () => {
    const { c, calls } = client({
      "POST /crm/v3/objects/contacts/search": () => ({ body: { results: [] } }),
      "POST /crm/v3/objects/contacts": () => ({ body: { id: "c1" } }),
    });
    expect(await upsertContact(c, { phone: "098765 43210", name: "Priya" })).toEqual({ id: "c1", created: true });
    expect(json(calls[0].body).filterGroups[0].filters[0].value).toBe("+919876543210");
    expect(json(calls[1].body).properties).toEqual({ phone: "+919876543210", firstname: "Priya" });
  });

  it("returns an existing contact without writing to it", async () => {
    const { c, calls } = client({
      "POST /crm/v3/objects/contacts/search": () => ({ body: { results: [{ id: "c9", properties: {} }] } }),
    });
    expect(await upsertContact(c, { phone: "+919876543210" })).toEqual({ id: "c9", created: false });
    expect(calls).toHaveLength(1);
  });

  it("rejects an invalid phone number before calling HubSpot", async () => {
    const { c, calls } = client({});
    await expect(upsertContact(c, { phone: "12" })).rejects.toThrow(/not valid/);
    expect(calls).toHaveLength(0);
  });
});

describe("upsertDeal", () => {
  it("creates once, associated to the contact", async () => {
    const { c, calls } = client({
      "POST /crm/v3/objects/deals/search": () => ({ body: { results: [] } }),
      "POST /crm/v3/objects/deals": () => ({ body: { id: "d1" } }),
    });
    const r = await upsertDeal(c, { callId: "call-1", properties: { dealname: "x", aangan_call_id: "call-1" }, contactId: "c1" });
    expect(r).toEqual({ id: "d1", created: true });
    expect(json(calls[0].body).filterGroups[0].filters[0]).toMatchObject({ propertyName: "aangan_call_id", value: "call-1" });
    expect(json(calls[1].body).associations[0]).toEqual({
      to: { id: "c1" },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }],
    });
  });

  it("a retried write finds the existing deal and never creates a duplicate or overwrites it", async () => {
    const { c, calls } = client({
      "POST /crm/v3/objects/deals/search": () => ({ body: { results: [{ id: "d1", properties: {} }] } }),
    });
    expect(await upsertDeal(c, { callId: "call-1", properties: { dealname: "x" } })).toEqual({ id: "d1", created: false });
    expect(calls.map((x) => x.method)).toEqual(["POST"]); // only the search
  });
});

describe("notes and tasks", () => {
  it("note is associated with the deal (214) and contact (202)", async () => {
    const { c, calls } = client({ "POST /crm/v3/objects/notes": () => ({ body: { id: "n1" } }) });
    await addNote(c, { dealId: "d1", contactId: "c1", body: "hello", at: new Date(1000) });
    const b = json(calls[0].body);
    expect(b.properties).toEqual({ hs_timestamp: 1000, hs_note_body: "hello" });
    expect(b.associations.map((a: { types: { associationTypeId: number }[] }) => a.types[0].associationTypeId)).toEqual([214, 202]);
  });

  it("task is a call task due at the requested time, associated to the deal (216)", async () => {
    const { c, calls } = client({ "POST /crm/v3/objects/tasks": () => ({ body: { id: "t1" } }) });
    await createTask(c, { dealId: "d1", subject: "Call back", dueAt: new Date(5000), ownerId: "77" });
    const b = json(calls[0].body);
    expect(b.properties).toMatchObject({ hs_timestamp: 5000, hs_task_type: "CALL", hs_task_status: "NOT_STARTED", hubspot_owner_id: "77" });
    expect(b.associations[0].types[0].associationTypeId).toBe(216);
  });
});

describe("owners and stages", () => {
  it("lists owners across pages", async () => {
    const { c } = client({
      "GET /crm/v3/owners": [
        () => ({ body: { results: [{ id: "1", email: "a@x" }], paging: { next: { after: "p2" } } } }),
        () => ({ body: { results: [{ id: "2", email: "b@x" }] } }),
      ],
    });
    expect((await listOwners(c)).map((o) => o.id)).toEqual(["1", "2"]);
  });

  it("resolves our stage keys to this portal's stage ids by label", async () => {
    const stages = STAGES.map((s, i) => ({ id: `s${i}`, label: s.label }));
    const { c } = client({
      "GET /crm/v3/pipelines/deals": () => ({ body: { results: [{ id: "p1", label: PIPELINE_LABEL, stages }] } }),
    });
    const r = await resolveStageIds(c, PIPELINE_LABEL);
    expect(r.pipelineId).toBe("p1");
    expect(r.stageIds.new_qualified).toBe("s0");
    expect(r.stageIds.incomplete_call).toBe(`s${STAGES.length - 1}`);
  });

  it("explains how to fix a pipeline that is missing stages", async () => {
    const { c } = client({
      "GET /crm/v3/pipelines/deals": () => ({ body: { results: [{ id: "p1", label: PIPELINE_LABEL, stages: [{ id: "a", label: "Claimed" }] }] } }),
    });
    await expect(resolveStageIds(c, PIPELINE_LABEL)).rejects.toThrow(/hubspot:setup/);
  });
});
