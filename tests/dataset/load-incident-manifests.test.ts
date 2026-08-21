import { describe, it, expect } from "vitest";
import { loadIncidentManifests } from "@/lib/dataset/load-incident-manifests";

describe("loadIncidentManifests", () => {
  it("loads at least 56 real committed manifests with incident, manifest, and event data", () => {
    const manifests = loadIncidentManifests();
    expect(manifests.length).toBeGreaterThanOrEqual(56);

    const first = manifests[0]!;
    expect(first.incident.id).toMatch(/^INC-/);
    expect(first.manifest.expectedEvidence.length).toBeGreaterThan(0);
    expect(first.logEvents.length).toBeGreaterThan(0);
    expect(first.metricEvents.length).toBeGreaterThan(0);
  });

  it("returns an empty array for a directory that does not exist, rather than throwing", () => {
    expect(loadIncidentManifests("/nonexistent/manifests/dir")).toEqual([]);
  });
});
