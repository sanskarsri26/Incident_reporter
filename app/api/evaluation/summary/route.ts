import { NextResponse } from "next/server";
import { readEvaluationReport } from "@/lib/evaluation/report";

export async function GET() {
  const report = readEvaluationReport();
  if (!report) {
    return NextResponse.json({
      available: false,
      message: "No evaluation report has been generated yet. Run `npm run evaluate`.",
    });
  }
  return NextResponse.json({ available: true, report });
}
