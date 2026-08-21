import { describe, it, expect } from "vitest";
import { loadManifests, loadEmbeddedDocuments } from "../../scripts/evaluate";

describe("evaluate script loaders", () => {
  it("loads at least 56 incident manifests with events and a ground-truth manifest", () => {
    const manifests = loadManifests();
    expect(manifests.length).toBeGreaterThanOrEqual(56);

    const first = manifests[0]!;
    expect(first.incident.id).toMatch(/^INC-/);
    expect(first.logEvents.length).toBeGreaterThan(0);
    expect(first.metricEvents.length).toBeGreaterThan(0);
    expect(first.manifest.expectedEvidence.length).toBeGreaterThan(0);
  });

  it("loads runbook documents with real (non-null) mock embeddings attached", async () => {
    const documents = await loadEmbeddedDocuments();
    expect(documents.length).toBe(11);
    for (const doc of documents) {
      expect(doc.embedding).not.toBeNull();
      expect(doc.embedding!.length).toBeGreaterThan(0);
    }
  });
});
