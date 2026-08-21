import { describe, it, expect, vi } from "vitest";
import { NextResponse } from "next/server";
import { withRequestLog, type RequestLogEntry, type RequestLogger } from "@/lib/observability/request-log";

function fakeLogger(): RequestLogger & { entries: RequestLogEntry[] } {
  const entries: RequestLogEntry[] = [];
  return {
    entries,
    log(entry) {
      entries.push(entry);
    },
  };
}

describe("withRequestLog", () => {
  it("logs routeName/method/status/durationMs and passes the response through unchanged", async () => {
    const logger = fakeLogger();
    const handler = vi.fn(async () => NextResponse.json({ ok: true }, { status: 201 }));
    const wrapped = withRequestLog("test-route", handler, logger);

    const request = new Request("http://localhost/api/test", { method: "POST" });
    const response = await wrapped(request);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledWith(request);

    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({ routeName: "test-route", method: "POST", status: 201 });
    expect(logger.entries[0]!.durationMs).toBeGreaterThanOrEqual(0);
    expect(new Date(logger.entries[0]!.timestamp).toISOString()).toBe(logger.entries[0]!.timestamp);
  });

  it("passes through extra handler args (e.g. dynamic-segment context) unchanged", async () => {
    const logger = fakeLogger();
    const handler = vi.fn(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
      const { id } = await context.params;
      return NextResponse.json({ id });
    });
    const wrapped = withRequestLog("test-route-with-params", handler, logger);

    const request = new Request("http://localhost/api/test/abc");
    const response = await wrapped(request, { params: Promise.resolve({ id: "abc" }) });

    expect(await response.json()).toEqual({ id: "abc" });
    expect(logger.entries[0]).toMatchObject({ routeName: "test-route-with-params", status: 200 });
  });

  it("logs status 500 and re-throws when the handler throws, instead of swallowing the error", async () => {
    const logger = fakeLogger();
    const handler = vi.fn(async () => {
      throw new Error("boom");
    });
    const wrapped = withRequestLog("failing-route", handler, logger);

    await expect(wrapped(new Request("http://localhost/api/fail"))).rejects.toThrow("boom");
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({ routeName: "failing-route", status: 500 });
  });

  it("never includes request/response body content in the log entry", async () => {
    const logger = fakeLogger();
    const handler = vi.fn(async () => NextResponse.json({ secretEvidence: "sensitive log text" }));
    const wrapped = withRequestLog("sensitive-route", handler, logger);

    await wrapped(new Request("http://localhost/api/sensitive", { method: "POST", body: JSON.stringify({ password: "hunter2" }) }));

    const loggedKeys = Object.keys(logger.entries[0]!);
    expect(loggedKeys.sort()).toEqual(["durationMs", "method", "routeName", "status", "timestamp"]);
  });

  it("defaults to the console logger when none is supplied", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const wrapped = withRequestLog("default-logger-route", async () => NextResponse.json({}));

    await wrapped(new Request("http://localhost/api/default"));

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(consoleSpy.mock.calls[0]![0] as string) as RequestLogEntry;
    expect(logged.routeName).toBe("default-logger-route");
    consoleSpy.mockRestore();
  });
});
