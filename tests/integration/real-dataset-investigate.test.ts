import { describe, it, expect, beforeEach } from "vitest";
import { resetRepositoryForTests, getRepository } from "@/lib/db/index";
import { resetProvidersForTests } from "@/lib/gemini/index";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";
import { seedServices, seedIncidents, seedRunbooks } from "../../scripts/seed";
import { POST as investigate } from "@/app/api/incidents/[id]/investigate/route";
import { GET as getSimilar } from "@/app/api/incidents/[id]/similar/route";
import { GET as getTimeline } from "@/app/api/incidents/[id]/timeline/route";

function postRequest(incidentId: string): Request {
  return new Request(`http://localhost/api/incidents/${incidentId}/investigate`, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.20" },
  });
}

describe("full API stack against the real generated dataset (56 incidents, 8 fault types)", () => {
  beforeEach(async () => {
    resetRepositoryForTests();
    resetProvidersForTests();
    resetRateLimiterForTests();
    await seedServices();
    await seedIncidents();
    await seedRunbooks();
  });

  it("investigates a real db_connection_pool_exhaustion incident without crashing and returns a well-formed response", async () => {
    const repo = getRepository();
    const incidents = await repo.listIncidents(null);
    const target = incidents.find((i) => i.rootCauseTruth === "db_connection_pool_exhaustion");
    expect(target).toBeDefined();

    const response = await investigate(postRequest(target!.id), { params: Promise.resolve({ id: target!.id }) });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(typeof body.finalRootCause).toBe("string");
    expect(body.predictions.length).toBeGreaterThan(0);
    expect(body.predictions[0].confidence).toBeGreaterThanOrEqual(0);
    expect(body.predictions[0].confidence).toBeLessThanOrEqual(1);

    const catalogSourceIds = new Set(body.evidenceCatalog.map((c: { sourceType: string; sourceId: string }) => `${c.sourceType}:${c.sourceId}`));
    for (const item of body.evidence) {
      expect(catalogSourceIds.has(`${item.sourceType}:${item.sourceId}`)).toBe(true);
    }
  });

  it("investigates one real incident per fault type without any pipeline crash", async () => {
    const repo = getRepository();
    const incidents = await repo.listIncidents(null);
    const faults = [...new Set(incidents.map((i) => i.rootCauseTruth))];
    expect(faults.length).toBe(8);

    for (const fault of faults) {
      const target = incidents.find((i) => i.rootCauseTruth === fault)!;
      const response = await investigate(postRequest(target.id), { params: Promise.resolve({ id: target.id }) });
      expect(response.status).toBe(200);
    }
  });

  it("ranks a same-fault-type incident above unrelated ones for a real incident", async () => {
    // cpu_spike is the only fault type whose affectedServices set
    // (checkout-service + inventory-service) isn't shared with any other
    // fault type in this dataset (confirmed by inspecting the generated
    // manifests), so this is a case where the mock embedding provider's
    // shared-token similarity deterministically ranks a same-fault-type
    // historical incident at the top -- not a flaky assumption about the
    // mock's general retrieval quality.
    const repo = getRepository();
    const incidents = await repo.listIncidents(null);
    const target = incidents.find((i) => i.rootCauseTruth === "cpu_spike");
    expect(target).toBeDefined();

    const response = await getSimilar(new Request("http://localhost"), { params: Promise.resolve({ id: target!.id }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.similar.length).toBeGreaterThan(0);

    const incidentById = new Map(incidents.map((i) => [i.id, i]));
    const topMatch = incidentById.get(body.similar[0].incident.id);
    expect(topMatch?.rootCauseTruth).toBe("cpu_spike");
  });

  it("returns a non-empty, time-sorted timeline for a real incident", async () => {
    const repo = getRepository();
    const incidents = await repo.listIncidents(null);
    const target = incidents[0]!;

    const response = await getTimeline(new Request("http://localhost"), { params: Promise.resolve({ id: target.id }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.timeline.length).toBeGreaterThan(0);
    for (let i = 1; i < body.timeline.length; i += 1) {
      expect(body.timeline[i].timestamp >= body.timeline[i - 1].timestamp).toBe(true);
    }
  });
});
