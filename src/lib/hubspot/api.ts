// All HubSpot paths in one place. The API is versioned (/crm/v3 is the long-standing stable path; newer dated
// versions such as 2026-09 also exist). Verified by the Phase 2A smoke test against the real portal; change here only.

export const PATHS = {
  contacts: "/crm/v3/objects/contacts",
  contactsSearch: "/crm/v3/objects/contacts/search",
  deals: "/crm/v3/objects/deals",
  dealsSearch: "/crm/v3/objects/deals/search",
  notes: "/crm/v3/objects/notes",
  tasks: "/crm/v3/objects/tasks",
  owners: "/crm/v3/owners",
  dealPipelines: "/crm/v3/pipelines/deals",
  dealProperties: "/crm/v3/properties/deals",
  associationLabels: (from: string, to: string) => `/crm/v4/associations/${from}/${to}/labels`,
} as const;

// HubSpot-defined default association type ids (from HubSpot docs and general knowledge; the setup script re-checks them).
export const ASSOCIATION_TYPES = {
  dealToContact: 3,
  noteToDeal: 214,
  noteToContact: 202,
  taskToContact: 204,
  taskToDeal: 216,
} as const;
