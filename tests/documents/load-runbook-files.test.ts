import { describe, it, expect } from "vitest";
import { docTypeForFilename, loadRunbookFiles } from "@/lib/documents/load-runbook-files";

describe("docTypeForFilename", () => {
  it("classifies service- prefixed files as service_description", () => {
    expect(docTypeForFilename("service-postgres.md")).toBe("service_description");
  });

  it("classifies everything else as runbook", () => {
    expect(docTypeForFilename("db_connection_pool_exhaustion.md")).toBe("runbook");
  });
});

describe("loadRunbookFiles", () => {
  it("loads all 11 real committed runbook/service docs with titles derived from the markdown heading", () => {
    const files = loadRunbookFiles();
    expect(files.length).toBe(11);

    const dbDoc = files.find((f) => f.id === "db_connection_pool_exhaustion");
    expect(dbDoc?.docType).toBe("runbook");
    expect(dbDoc?.title.length).toBeGreaterThan(0);
    expect(dbDoc?.body).toContain("#");

    const svcDoc = files.find((f) => f.id === "service-postgres");
    expect(svcDoc?.docType).toBe("service_description");
  });

  it("returns an empty array for a directory that does not exist, rather than throwing", () => {
    expect(loadRunbookFiles("/nonexistent/runbooks/dir")).toEqual([]);
  });
});
