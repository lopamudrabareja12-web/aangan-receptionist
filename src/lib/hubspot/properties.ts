// Custom deal properties. Kept deliberately few: HubSpot's free plan allows about 10 custom properties in total
// (to be confirmed in the account's Usage & Limits). Everything else goes into the deal description or a Note.

export interface PropertyDef {
  name: string;
  label: string;
  type: "string" | "number" | "date" | "bool" | "enumeration";
  fieldType: "text" | "number" | "date" | "booleancheckbox";
  description: string;
}

export const DEAL_PROPERTIES: readonly PropertyDef[] = [
  { name: "aangan_call_id", label: "Aangan call ID", type: "string", fieldType: "text", description: "Our internal call id. Used to find the deal again so a retry never creates a duplicate." },
  { name: "aangan_carpet_area_sqft", label: "Carpet area (sq ft)", type: "number", fieldType: "number", description: "As stated by the caller." },
  { name: "aangan_property_type", label: "Property type", type: "string", fieldType: "text", description: "e.g. 3BHK apartment, villa, office." },
  { name: "aangan_ready_by", label: "Ready by", type: "date", fieldType: "date", description: "When the caller needs the project finished." },
  { name: "aangan_referral_source", label: "Referral source", type: "string", fieldType: "text", description: "How the caller heard about Aangan." },
  { name: "aangan_call_cost_inr", label: "Call cost (INR)", type: "number", fieldType: "number", description: "Voice + AI cost of handling this call, computed from the configured rates." },
];

export const DEAL_PROPERTY_GROUP = "dealinformation";
