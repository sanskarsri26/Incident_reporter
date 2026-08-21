import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { DocType } from "@/lib/types";

const RUNBOOKS_DIR = path.resolve(import.meta.dirname, "..", "..", "data", "runbooks");

export interface RunbookFile {
  id: string;
  title: string;
  body: string;
  docType: DocType;
}

export function docTypeForFilename(filename: string): DocType {
  return filename.startsWith("service-") ? "service_description" : "runbook";
}

function titleFromMarkdown(body: string, fallback: string): string {
  const heading = body.split("\n").find((line) => line.startsWith("# "));
  return heading ? heading.replace(/^#\s+/, "").trim() : fallback;
}

export function loadRunbookFiles(runbooksDir: string = RUNBOOKS_DIR): RunbookFile[] {
  let files: string[] = [];
  try {
    files = readdirSync(runbooksDir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }

  return files.map((file) => {
    const body = readFileSync(path.join(runbooksDir, file), "utf-8");
    const id = file.replace(/\.md$/, "");
    return { id, title: titleFromMarkdown(body, id), body, docType: docTypeForFilename(file) };
  });
}
