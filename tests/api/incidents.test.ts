import { describe, it, expect, beforeEach } from "vitest";
import { resetRepositoryForTests, getRepository } from "@/lib/db/index";
import { GET as listIncidents } from "@/app/api/incidents/route";
import { GET as getIncident } from "@/app/api/incidents/[id]/route";
import { POST as postSignup } from "@/app/api/auth/signup/route";

describe("/api/incidents", () => {
  beforeEach(async () => {
    resetRepositoryForTests();
    await getRepository().upsertIncident({
      id: "INC-0001",
      title: "DB connection pool exhaustion",
      severity: "sev1",
      status: "resolved",
      startedAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: null,
      rootCauseTruth: "db_connection_pool_exhaustion",
      affectedServices: ["payment-service"],
      ownerId: null,
    });
  });

  it("GET /api/incidents returns the seeded incident", async () => {
    const response = await listIncidents(new Request("http://localhost/api/incidents"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.incidents).toHaveLength(1);
    expect(body.incidents[0].id).toBe("INC-0001");
  });

  it("GET /api/incidents/:id returns 200 for a known incident", async () => {
    const response = await getIncident(new Request("http://localhost/api/incidents/INC-0001"), {
      params: Promise.resolve({ id: "INC-0001" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.incident.title).toBe("DB connection pool exhaustion");
  });

  it("GET /api/incidents/:id returns 404 for an unknown incident", async () => {
    const response = await getIncident(new Request("http://localhost/api/incidents/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(response.status).toBe(404);
  });

  it("GET /api/incidents/:id returns 400 for an id that is too long", async () => {
    const tooLong = "x".repeat(65);
    const response = await getIncident(new Request(`http://localhost/api/incidents/${tooLong}`), {
      params: Promise.resolve({ id: tooLong }),
    });
    expect(response.status).toBe(400);
  });

  it("excludes another user's private incidents from the list", async () => {
    const signupResponse = await postSignup(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email: "owner@example.com", password: "password123" }),
      }),
    );
    const cookie = signupResponse.headers.get("set-cookie")!.split(";")[0]!;

    await getRepository().upsertIncident({
      id: "INC-PRIVATE",
      title: "Private incident",
      severity: "sev3",
      status: "open",
      startedAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: null,
      rootCauseTruth: null,
      affectedServices: [],
      ownerId: "some-other-user",
    });

    const response = await listIncidents(new Request("http://localhost/api/incidents", { headers: { cookie } }));
    const body = await response.json();
    expect(body.incidents.some((i: { id: string }) => i.id === "INC-PRIVATE")).toBe(false);
  });
});
