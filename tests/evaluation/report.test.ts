import { describe, it, expect } from "vitest";
import path from "node:path";
import { readEvaluationReport } from "@/lib/evaluation/report";

const REAL_REPORT_PATH = path.resolve(import.meta.dirname, "..", "..", "data", "evaluation-report.json");

describe("readEvaluationReport", () => {
  it("parses the real committed evaluation report", () => {
    const report = readEvaluationReport(REAL_REPORT_PATH);
    expect(report).not.toBeNull();
    expect(report?.datasetSize).toBeGreaterThanOrEqual(56);
    expect(report?.primary.caseCount).toBeGreaterThan(0);
  });

  it("returns null when the report file does not exist", () => {
    expect(readEvaluationReport("/nonexistent/path/evaluation-report.json")).toBeNull();
  });

  it("returns null when the file exists but does not match the expected schema", async () => {
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const os = await import("node:os");
    const dir = mkdtempSync(path.join(os.tmpdir(), "eval-report-test-"));
    const badPath = path.join(dir, "bad.json");
    writeFileSync(badPath, JSON.stringify({ not: "a valid report" }));
    expect(readEvaluationReport(badPath)).toBeNull();
  });
});
