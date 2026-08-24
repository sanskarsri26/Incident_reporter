import { describe, it, expect } from "vitest";
import { uploadedLogLineSchema, uploadedMetricLineSchema, uploadTitleSchema, uploadSeveritySchema } from "@/lib/security/validation";

describe("uploadedLogLineSchema", () => {
  it("accepts a well-formed line", () => {
    const result = uploadedLogLineSchema.safeParse({
      timestamp: "2026-01-01T00:00:00.000Z",
      service: "payment-service",
      level: "error",
      message: "connection refused",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid level", () => {
    const result = uploadedLogLineSchema.safeParse({
      timestamp: "2026-01-01T00:00:00.000Z",
      service: "payment-service",
      level: "critical",
      message: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-ISO timestamp", () => {
    const result = uploadedLogLineSchema.safeParse({
      timestamp: "not a date",
      service: "payment-service",
      level: "error",
      message: "x",
    });
    expect(result.success).toBe(false);
  });
});

describe("uploadedMetricLineSchema", () => {
  it("accepts a well-formed line", () => {
    const result = uploadedMetricLineSchema.safeParse({
      timestamp: "2026-01-01T00:00:00.000Z",
      service: "payment-service",
      metric: "cpu_percent",
      value: 87.5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-numeric value", () => {
    const result = uploadedMetricLineSchema.safeParse({
      timestamp: "2026-01-01T00:00:00.000Z",
      service: "payment-service",
      metric: "cpu_percent",
      value: "high",
    });
    expect(result.success).toBe(false);
  });
});

describe("uploadSeveritySchema", () => {
  it("defaults to sev3 when omitted", () => {
    expect(uploadSeveritySchema.parse(undefined)).toBe("sev3");
  });
  it("rejects an unknown severity", () => {
    expect(uploadSeveritySchema.safeParse("sev9").success).toBe(false);
  });
});
