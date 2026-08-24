import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/index";
import { getAuthProviderForRequest } from "@/lib/auth/request-context";
import { consumeRateLimit, getRateLimiter } from "@/lib/security/rate-limit";
import {
  uploadTitleSchema,
  uploadSeveritySchema,
  uploadedLogLineSchema,
  uploadedMetricLineSchema,
} from "@/lib/security/validation";
import { withRequestLog } from "@/lib/observability/request-log";
import type { LogEvent, MetricEvent } from "@/lib/types";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
// Two files plus multipart form overhead; best-effort only since Content-Length can be omitted or spoofed.
const MAX_REQUEST_BYTES = MAX_FILE_BYTES * 2 + 10_000;

function parseLines<T>(
  text: string,
  schema: { safeParse(v: unknown): { success: boolean; data?: T; error?: { issues: Array<{ message: string }> } } },
): { lines: T[] } | { error: string } {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const parsed: T[] = [];
  for (const [index, line] of lines.entries()) {
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      return { error: `Invalid JSON on line ${index + 1}` };
    }
    const result = schema.safeParse(json);
    if (!result.success || !result.data) {
      const message = result.error?.issues.map((i) => i.message).join("; ") ?? "invalid";
      return { error: `Invalid entry on line ${index + 1}: ${message}` };
    }
    parsed.push(result.data);
  }
  return { lines: parsed };
}

export const POST = withRequestLog("incidents.upload", async (request: Request) => {
  const { provider } = getAuthProviderForRequest(request);
  const user = await provider.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const rateLimitResult = await consumeRateLimit(getRateLimiter(), `upload:${user.id}`);
  if (!rateLimitResult.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Upload exceeds the size limit." }, { status: 413 });
  }

  const form = await request.formData();
  const titleResult = uploadTitleSchema.safeParse(form.get("title"));
  if (!titleResult.success) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  const severityResult = uploadSeveritySchema.safeParse(form.get("severity") ?? undefined);
  if (!severityResult.success) {
    return NextResponse.json({ error: "Invalid severity." }, { status: 400 });
  }

  const logFile = form.get("logFile");
  if (!(logFile instanceof File)) {
    return NextResponse.json({ error: "A log file is required." }, { status: 400 });
  }
  if (logFile.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Log file exceeds the 2MB limit." }, { status: 413 });
  }
  const metricsFile = form.get("metricsFile");
  if (metricsFile instanceof File && metricsFile.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Metrics file exceeds the 2MB limit." }, { status: 413 });
  }

  const logResult = parseLines(await logFile.text(), uploadedLogLineSchema);
  if ("error" in logResult) {
    return NextResponse.json({ error: logResult.error }, { status: 400 });
  }
  if (logResult.lines.length === 0) {
    return NextResponse.json({ error: "Log file has no entries." }, { status: 400 });
  }

  let metricLines: Array<{ timestamp: string; service: string; metric: string; value: number }> = [];
  if (metricsFile instanceof File) {
    const metricResult = parseLines(await metricsFile.text(), uploadedMetricLineSchema);
    if ("error" in metricResult) {
      return NextResponse.json({ error: metricResult.error }, { status: 400 });
    }
    metricLines = metricResult.lines;
  }

  const incidentId = globalThis.crypto.randomUUID();
  const startedAt = logResult.lines.reduce((min, l) => (l.timestamp < min ? l.timestamp : min), logResult.lines[0]!.timestamp);
  const affectedServices = [...new Set(logResult.lines.map((l) => l.service))];

  const incident = {
    id: incidentId,
    title: titleResult.data,
    severity: severityResult.data,
    status: "open" as const,
    startedAt,
    resolvedAt: null,
    rootCauseTruth: null,
    affectedServices,
    ownerId: user.id,
  };

  const logEvents: LogEvent[] = logResult.lines.map((line) => ({
    id: globalThis.crypto.randomUUID(),
    incidentId,
    timestamp: line.timestamp,
    service: line.service,
    level: line.level,
    template: line.message,
    count: 1,
  }));
  const metricEvents: MetricEvent[] = metricLines.map((line) => ({
    id: globalThis.crypto.randomUUID(),
    incidentId,
    timestamp: line.timestamp,
    service: line.service,
    metric: line.metric,
    value: line.value,
  }));

  const repository = getRepository();
  await repository.upsertIncident(incident);
  await repository.insertLogEvents(logEvents);
  if (metricEvents.length > 0) {
    await repository.insertMetricEvents(metricEvents);
  }

  return NextResponse.json({ incident }, { status: 201 });
});
