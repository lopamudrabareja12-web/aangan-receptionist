// Service area per source/services.md: Pune city + PCMC. Names are lower-case; matching is by whole word/phrase.
// "Adjoining areas" that appear in real calls but are not listed by name are included and marked.

const PUNE_CITY = [
  "pune", "kothrud", "baner", "aundh", "wakad", "koregaon park", "kalyani nagar", "viman nagar", "hadapsar",
  "magarpatta", "nibm", "kondhwa", "undri", "shivane", "warje", "erandwane", "deccan",
  // adjoining areas seen in calls / commonly part of Pune city (not named in services.md)
  "kharadi", "nanded city", "dahanukar colony", "bavdhan", "pashan", "balewadi", "wanowrie", "sus road", "sinhagad road",
];
const PCMC = ["pcmc", "pimpri", "chinchwad", "pimple saudagar", "pimple nilakh", "ravet", "hinjewadi", "pimple gurav", "akurdi"];

// Named in services.md as NOT served, plus other cities. Checked first: "Talegaon Dabhade, near Pune" is out of area.
const OUT_OF_AREA = [
  "talegaon", "lonavala", "lonavla", "nashik", "mumbai", "navi mumbai", "thane", "nagpur", "bengaluru", "bangalore",
  "delhi", "hyderabad", "chennai", "kolkata", "ahmedabad", "kolhapur", "satara", "solapur", "aurangabad", "goa",
];

export type AreaVerdict = "in_area" | "out_of_area" | "unknown";

const has = (text: string, name: string) => new RegExp(`(^|[^a-z])${name}([^a-z]|$)`).test(text);

export function classifyLocation(location: string | null | undefined): AreaVerdict {
  if (!location) return "unknown";
  const t = location.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (OUT_OF_AREA.some((n) => has(t, n))) return "out_of_area";
  if ([...PUNE_CITY, ...PCMC].some((n) => has(t, n))) return "in_area";
  return "unknown";
}
