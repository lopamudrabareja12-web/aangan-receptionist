import type { HubSpotClient } from "./client";
import { ASSOCIATION_TYPES, PATHS } from "./api";
import { normalizePhone } from "@/lib/phone";
import { STAGES, stageByKey, type StageKey } from "./stages";

interface SearchResult {
  results: { id: string; properties: Record<string, string | null> }[];
  paging?: { next?: { after: string } };
}

const assoc = (id: string, typeId: number) => ({
  to: { id },
  types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: typeId }],
});

/**
 * Find a contact by phone, or create one. An existing contact is returned untouched: designers own edits in HubSpot.
 * Limitation: matching is exact on the E.164 form we write, so a contact typed in another format will not match.
 */
export async function upsertContact(
  c: HubSpotClient,
  input: { phone: string; name?: string | null },
): Promise<{ id: string; created: boolean }> {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error("upsertContact: phone number is not valid");
  const found = await c.request<SearchResult>("POST", PATHS.contactsSearch, {
    filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: phone }] }],
    properties: ["phone", "firstname"],
    limit: 1,
  });
  if (found.results[0]) return { id: found.results[0].id, created: false };
  const created = await c.request<{ id: string }>("POST", PATHS.contacts, {
    properties: { phone, ...(input.name ? { firstname: input.name } : {}) },
  });
  return { id: created.id, created: true };
}

/**
 * Create the deal for a call, or return the existing one. Looked up by aangan_call_id, so a retried write never
 * duplicates. An existing deal is NOT modified: stage, owner and amount belong to HubSpot once it exists.
 */
export async function upsertDeal(
  c: HubSpotClient,
  input: { callId: string; properties: Record<string, string | number>; contactId?: string },
): Promise<{ id: string; created: boolean }> {
  const found = await c.request<SearchResult>("POST", PATHS.dealsSearch, {
    filterGroups: [{ filters: [{ propertyName: "aangan_call_id", operator: "EQ", value: input.callId }] }],
    limit: 1,
  });
  if (found.results[0]) return { id: found.results[0].id, created: false };
  const created = await c.request<{ id: string }>("POST", PATHS.deals, {
    properties: input.properties,
    associations: input.contactId ? [assoc(input.contactId, ASSOCIATION_TYPES.dealToContact)] : [],
  });
  return { id: created.id, created: true };
}

export async function addNote(
  c: HubSpotClient,
  input: { dealId: string; contactId?: string; body: string; at?: Date },
): Promise<{ id: string }> {
  return c.request("POST", PATHS.notes, {
    properties: { hs_timestamp: (input.at ?? new Date()).getTime(), hs_note_body: input.body },
    associations: [
      assoc(input.dealId, ASSOCIATION_TYPES.noteToDeal),
      ...(input.contactId ? [assoc(input.contactId, ASSOCIATION_TYPES.noteToContact)] : []),
    ],
  });
}

export async function createTask(
  c: HubSpotClient,
  input: { dealId: string; contactId?: string; subject: string; body?: string; dueAt: Date; ownerId?: string },
): Promise<{ id: string }> {
  return c.request("POST", PATHS.tasks, {
    properties: {
      hs_timestamp: input.dueAt.getTime(),
      hs_task_subject: input.subject,
      hs_task_body: input.body ?? "",
      hs_task_status: "NOT_STARTED",
      hs_task_type: "CALL",
      ...(input.ownerId ? { hubspot_owner_id: input.ownerId } : {}),
    },
    associations: [
      assoc(input.dealId, ASSOCIATION_TYPES.taskToDeal),
      ...(input.contactId ? [assoc(input.contactId, ASSOCIATION_TYPES.taskToContact)] : []),
    ],
  });
}

export async function setDealOwner(c: HubSpotClient, dealId: string, ownerId: string): Promise<void> {
  await c.request("PATCH", `${PATHS.deals}/${dealId}`, { properties: { hubspot_owner_id: ownerId } });
}

export async function moveDealStage(
  c: HubSpotClient,
  dealId: string,
  stageId: string,
): Promise<void> {
  await c.request("PATCH", `${PATHS.deals}/${dealId}`, { properties: { dealstage: stageId } });
}

export async function updateDealProperties(c: HubSpotClient, dealId: string, properties: Record<string, string | number>): Promise<void> {
  await c.request("PATCH", `${PATHS.deals}/${dealId}`, { properties });
}

export interface PipelineDeal {
  id: string;
  name: string;
  stageId: string;
  ownerId: string | null;
  amount: number | null;
}

/** Deals in one pipeline (up to `max`), for the console's stage funnel. HubSpot stays the source of truth for stage and owner. */
export async function listPipelineDeals(c: HubSpotClient, pipelineId: string, max = 500): Promise<PipelineDeal[]> {
  const out: PipelineDeal[] = [];
  let after: string | undefined;
  do {
    const page: SearchResult = await c.request<SearchResult>("POST", PATHS.dealsSearch, {
      filterGroups: [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: pipelineId }] }],
      properties: ["dealname", "dealstage", "hubspot_owner_id", "amount"],
      limit: 100,
      ...(after ? { after } : {}),
    });
    for (const r of page.results) {
      out.push({ id: r.id, name: r.properties.dealname ?? "", stageId: r.properties.dealstage ?? "", ownerId: r.properties.hubspot_owner_id || null, amount: r.properties.amount ? Number(r.properties.amount) : null });
    }
    after = page.paging?.next?.after;
  } while (after && out.length < max);
  return out;
}

export interface Owner {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export async function listOwners(c: HubSpotClient): Promise<Owner[]> {
  const out: Owner[] = [];
  let after: string | undefined;
  do {
    const page = await c.request<{ results: Owner[]; paging?: { next?: { after: string } } }>(
      "GET",
      `${PATHS.owners}?limit=100${after ? `&after=${after}` : ""}`,
    );
    out.push(...page.results);
    after = page.paging?.next?.after;
  } while (after);
  return out;
}

/** Map our stage keys to this portal's stage ids by label, so we never hard-code HubSpot's internal ids. */
export async function resolveStageIds(
  c: HubSpotClient,
  pipelineLabel: string,
): Promise<{ pipelineId: string; stageIds: Record<StageKey, string> }> {
  const { results } = await c.request<{
    results: { id: string; label: string; stages: { id: string; label: string }[] }[];
  }>("GET", PATHS.dealPipelines);
  const pipeline = results.find((p) => p.label === pipelineLabel);
  if (!pipeline) throw new Error(`HubSpot pipeline "${pipelineLabel}" not found. Run: npm run hubspot:setup`);
  const stageIds = {} as Record<StageKey, string>;
  const missing: string[] = [];
  for (const { key } of STAGES) {
    const label = stageByKey(key).label;
    const s = pipeline.stages.find((x) => x.label === label);
    if (s) stageIds[key] = s.id;
    else missing.push(label);
  }
  if (missing.length) throw new Error(`HubSpot pipeline is missing stages: ${missing.join(", ")}. Run: npm run hubspot:setup`);
  return { pipelineId: pipeline.id, stageIds };
}

/** Current stage id of a deal. */
export async function getDealStage(c: HubSpotClient, dealId: string): Promise<string | null> {
  const r = await c.request<{ properties: Record<string, string | null> }>("GET", `${PATHS.deals}/${dealId}?properties=dealstage`);
  return r.properties.dealstage ?? null;
}

/** Number of OPEN deals an owner has in the Aangan pipeline. HubSpot is the source of truth for who owns what. */
export async function countOpenDeals(c: HubSpotClient, ownerId: string, pipelineId: string): Promise<number> {
  const r = await c.request<{ total: number }>("POST", PATHS.dealsSearch, {
    filterGroups: [
      {
        filters: [
          { propertyName: "hubspot_owner_id", operator: "EQ", value: ownerId },
          { propertyName: "pipeline", operator: "EQ", value: pipelineId },
          { propertyName: "hs_is_closed", operator: "EQ", value: "false" },
        ],
      },
    ],
    limit: 1,
  });
  return r.total;
}
