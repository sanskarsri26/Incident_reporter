import { describe, it, expect, beforeEach } from "vitest";
import { resetRepositoryForTests, getRepository } from "@/lib/db/index";
import { resetMockAuthProviderForTests } from "@/lib/auth/mock-auth-provider";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";
import { POST as postSignup } from "@/app/api/auth/signup/route";
import { POST as postUpload } from "@/app/api/incidents/upload/route";

async function signedInSession(): Promise<{ cookie: string; userId: string }> {
  const response = await postSignup(
    new Request("http://localhost/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "uploader@example.com", password: "password123" }),
    }),
  );
  const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
  // The mock provider's session cookie value is the plaintext user id (see
  // lib/auth/mock-auth-provider.ts's setSession) -- decode it here instead
  // of adding a second signup call just to read the id back from an upload.
  const userId = cookie.split("=")[1]!;
  return { cookie, userId };
}

function uploadRequest(form: FormData, cookie?: string): Request {
  return new Request("http://localhost/api/incidents/upload", {
    method: "POST",
    headers: cookie ? { cookie } : {},
    body: form,
  });
}

function oversizedContentLengthRequest(cookie: string): Request {
  return new Request("http://localhost/api/incidents/upload", {
    method: "POST",
    headers: { cookie, "content-length": String(10 * 1024 * 1024) },
    body: "",
  });
}

function logLinesFile(lines: object[]): File {
  return new File([lines.map((l) => JSON.stringify(l)).join("\n")], "app.log", { type: "application/x-ndjson" });
}

describe("POST /api/incidents/upload", () => {
  beforeEach(() => {
    resetRepositoryForTests();
    resetMockAuthProviderForTests();
    resetRateLimiterForTests();
  });

  it("rejects an unauthenticated request", async () => {
    const form = new FormData();
    form.set("title", "My incident");
    form.set("logFile", logLinesFile([{ timestamp: "2026-01-01T00:00:00.000Z", service: "api", level: "error", message: "x" }]));
    const response = await postUpload(uploadRequest(form));
    expect(response.status).toBe(401);
  });

  it("creates a private incident owned by the caller, with log events inserted", async () => {
    const { cookie } = await signedInSession();
    const form = new FormData();
    form.set("title", "My incident");
    form.set("severity", "sev2");
    form.set(
      "logFile",
      logLinesFile([
        { timestamp: "2026-01-01T00:05:00.000Z", service: "api", level: "error", message: "timeout" },
        { timestamp: "2026-01-01T00:00:00.000Z", service: "worker", level: "warn", message: "retrying" },
      ]),
    );

    const response = await postUpload(uploadRequest(form, cookie));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.incident.title).toBe("My incident");
    expect(body.incident.severity).toBe("sev2");
    expect(body.incident.rootCauseTruth).toBeNull();
    expect(body.incident.ownerId).toBeTruthy();
    // earliest of the two log timestamps
    expect(body.incident.startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(body.incident.affectedServices.sort()).toEqual(["api", "worker"]);

    const logEvents = await getRepository().listLogEvents(body.incident.id);
    expect(logEvents).toHaveLength(2);
  });

  it("also inserts metric events when a metrics file is provided", async () => {
    const { cookie } = await signedInSession();
    const form = new FormData();
    form.set("title", "My incident");
    form.set("logFile", logLinesFile([{ timestamp: "2026-01-01T00:00:00.000Z", service: "api", level: "error", message: "x" }]));
    form.set(
      "metricsFile",
      new File(
        [JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z", service: "api", metric: "cpu_percent", value: 91 })],
        "metrics.log",
      ),
    );

    const response = await postUpload(uploadRequest(form, cookie));
    expect(response.status).toBe(201);
    const body = await response.json();
    const metricEvents = await getRepository().listMetricEvents(body.incident.id);
    expect(metricEvents).toHaveLength(1);
    expect(metricEvents[0]?.metric).toBe("cpu_percent");
  });

  it("rejects a malformed log line with the line number", async () => {
    const { cookie, userId } = await signedInSession();
    const form = new FormData();
    form.set("title", "My incident");
    form.set(
      "logFile",
      new File(
        [
          [
            JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z", service: "api", level: "error", message: "ok" }),
            JSON.stringify({ timestamp: "not a date", service: "api", level: "error", message: "bad" }),
          ].join("\n"),
        ],
        "app.log",
      ),
    );

    const response = await postUpload(uploadRequest(form, cookie));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("line 2");

    // Nothing should have been written for a rejected upload. Scoped to this
    // user's own incidents -- listIncidents(null) only returns shared
    // incidents and would pass vacuously since uploads are always private.
    expect((await getRepository().listIncidents(userId)).length).toBe(0);
  });

  it("rejects a log file over the 2MB cap without parsing it", async () => {
    const { cookie } = await signedInSession();
    const form = new FormData();
    form.set("title", "My incident");
    form.set("logFile", new File([new Uint8Array(2 * 1024 * 1024 + 1)], "app.log"));
    const response = await postUpload(uploadRequest(form, cookie));
    expect(response.status).toBe(413);
  });

  it("rejects a request whose content-length exceeds the cap without parsing the body", async () => {
    const { cookie, userId } = await signedInSession();
    const response = await postUpload(oversizedContentLengthRequest(cookie));
    expect(response.status).toBe(413);

    // Nothing should have been written -- the body was never parsed. Scoped
    // to this user's own incidents -- see the comment above for why
    // listIncidents(null) wouldn't actually catch a regression here.
    expect((await getRepository().listIncidents(userId)).length).toBe(0);
  });

  it("rejects a request with no log file", async () => {
    const { cookie } = await signedInSession();
    const form = new FormData();
    form.set("title", "My incident");
    const response = await postUpload(uploadRequest(form, cookie));
    expect(response.status).toBe(400);
  });
});
