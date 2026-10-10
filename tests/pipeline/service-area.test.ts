import { describe, it, expect } from "vitest";
import { classifyLocation } from "@/lib/pipeline/service-area";

describe("classifyLocation", () => {
  it.each(["Kothrud", "Kothrud (Dahanukar Colony)", "Pimple Saudagar", "Baner, Pune", "Hinjewadi Phase 1", "PCMC", "magarpatta cybercity", "Kharadi"])("%s is in the area", (l) =>
    expect(classifyLocation(l)).toBe("in_area"));
  it.each(["Nashik", "Talegaon Dabhade, near Pune", "Lonavala", "Mumbai", "Navi Mumbai", "Bangalore"])("%s is out of the area", (l) =>
    expect(classifyLocation(l)).toBe("out_of_area"));
  it.each([null, undefined, "", "Somewhere new"])("%s is unknown, not a decline", (l) => expect(classifyLocation(l)).toBe("unknown"));
  it("matches whole words only", () => {
    expect(classifyLocation("Punekar Heights, Delhi")).toBe("out_of_area");
    expect(classifyLocation("Banerjee Road")).toBe("unknown");
  });
});
