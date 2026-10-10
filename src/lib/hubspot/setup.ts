import type { HubSpotClient } from "./client";
import { HubSpotError } from "./client";
import { ASSOCIATION_TYPES, PATHS } from "./api";
import { DEAL_PROPERTIES, DEAL_PROPERTY_GROUP, type PropertyDef } from "./properties";
import { PIPELINE_LABEL, STAGES, type StageDef } from "./stages";

export interface PortalState {
  pipelines: { id: string; label: string; stages: { label: string }[] }[];
  propertyNames: string[];
}

export type SetupAction =
  | { type: "create_property"; def: PropertyDef }
  | { type: "create_pipeline" }
  | { type: "add_stages"; pipelineId: string; stages: StageDef[] }
  | { type: "adopt_default_pipeline"; pipelineId: string };

export interface SetupPlan {
  actions: SetupAction[];
  warnings: string[];
}

/** Pure: compares what the portal has with what we need. Never plans a deletion. */
export function planSetup(state: PortalState, opts: { adoptDefault: boolean }): SetupPlan {
  const actions: SetupAction[] = [];
  const warnings: string[] = [];

  for (const def of DEAL_PROPERTIES) {
    if (!state.propertyNames.includes(def.name)) actions.push({ type: "create_property", def });
  }

  const ours = state.pipelines.find((p) => p.label === PIPELINE_LABEL);
  if (ours) {
    const have = new Set(ours.stages.map((s) => s.label));
    const missing = STAGES.filter((s) => !have.has(s.label));
    if (missing.length) actions.push({ type: "add_stages", pipelineId: ours.id, stages: missing });
  } else if (opts.adoptDefault) {
    const target = state.pipelines[0];
    if (!target) warnings.push("No existing pipeline to adopt.");
    else actions.push({ type: "adopt_default_pipeline", pipelineId: target.id });
  } else {
    actions.push({ type: "create_pipeline" });
    warnings.push(
      "Creating a second pipeline needs a paid plan. On the free plan this will be refused; re-run with --adopt-default to rename and reuse the empty default pipeline.",
    );
  }
  return { actions, warnings };
}

const stageBody = (s: StageDef, displayOrder: number) => ({
  label: s.label,
  displayOrder,
  metadata: { probability: s.probability.toFixed(2) },
});

export async function readPortalState(c: HubSpotClient): Promise<PortalState> {
  const [pipes, props] = await Promise.all([
    c.request<{ results: { id: string; label: string; stages: { label: string }[] }[] }>("GET", PATHS.dealPipelines),
    c.request<{ results: { name: string }[] }>("GET", PATHS.dealProperties),
  ]);
  return { pipelines: pipes.results, propertyNames: props.results.map((p) => p.name) };
}

export async function applyAction(c: HubSpotClient, a: SetupAction): Promise<string> {
  switch (a.type) {
    case "create_property":
      await c.request("POST", PATHS.dealProperties, {
        name: a.def.name,
        label: a.def.label,
        type: a.def.type,
        fieldType: a.def.fieldType,
        groupName: DEAL_PROPERTY_GROUP,
        description: a.def.description,
      });
      return `created property ${a.def.name}`;
    case "create_pipeline":
      try {
        await c.request("POST", PATHS.dealPipelines, {
          label: PIPELINE_LABEL,
          displayOrder: 0,
          stages: STAGES.map(stageBody),
        });
      } catch (e) {
        if (e instanceof HubSpotError && e.status >= 400 && e.status < 500) {
          throw new Error(`${e.message}. If this is a plan limit, re-run with --adopt-default.`);
        }
        throw e;
      }
      return `created pipeline "${PIPELINE_LABEL}"`;
    case "add_stages": {
      const base = STAGES.length;
      for (const [i, s] of a.stages.entries()) {
        await c.request("POST", `${PATHS.dealPipelines}/${a.pipelineId}/stages`, stageBody(s, base + i));
      }
      return `added ${a.stages.length} stage(s)`;
    }
    case "adopt_default_pipeline": {
      const used = await c.request<{ total: number }>("POST", PATHS.dealsSearch, {
        filterGroups: [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: a.pipelineId }] }],
        limit: 1,
      });
      if (used.total > 0) {
        throw new Error(`Refusing to rewrite pipeline "${a.pipelineId}": it already has ${used.total} deal(s).`);
      }
      await c.request("PUT", `${PATHS.dealPipelines}/${a.pipelineId}`, {
        label: PIPELINE_LABEL,
        displayOrder: 0,
        stages: STAGES.map(stageBody),
      });
      return `renamed empty pipeline "${a.pipelineId}" to "${PIPELINE_LABEL}" and replaced its stages`;
    }
  }
}

/** Confirms the association type ids we hard-code are what this portal reports. Returns a list of mismatches. */
export async function checkAssociations(c: HubSpotClient): Promise<string[]> {
  const pairs: [string, string, number][] = [
    ["deals", "contacts", ASSOCIATION_TYPES.dealToContact],
    ["notes", "deals", ASSOCIATION_TYPES.noteToDeal],
    ["notes", "contacts", ASSOCIATION_TYPES.noteToContact],
    ["tasks", "deals", ASSOCIATION_TYPES.taskToDeal],
    ["tasks", "contacts", ASSOCIATION_TYPES.taskToContact],
  ];
  const problems: string[] = [];
  for (const [from, to, expected] of pairs) {
    const r = await c.request<{ results: { category: string; typeId: number }[] }>("GET", PATHS.associationLabels(from, to));
    const ok = r.results.some((x) => x.category === "HUBSPOT_DEFINED" && x.typeId === expected);
    if (!ok) problems.push(`${from} -> ${to}: expected HUBSPOT_DEFINED type ${expected}, portal reports [${r.results.map((x) => `${x.category}:${x.typeId}`).join(", ")}]`);
  }
  return problems;
}

export function describeAction(a: SetupAction): string {
  switch (a.type) {
    case "create_property": return `create deal property ${a.def.name}`;
    case "create_pipeline": return `create pipeline "${PIPELINE_LABEL}" with ${STAGES.length} stages`;
    case "add_stages": return `add stages to pipeline ${a.pipelineId}: ${a.stages.map((s) => s.label).join(", ")}`;
    case "adopt_default_pipeline": return `rename empty pipeline ${a.pipelineId} to "${PIPELINE_LABEL}" and replace its stages`;
  }
}
