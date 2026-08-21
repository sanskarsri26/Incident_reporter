import { SERVICES, SERVICE_DEPENDENCIES } from "@/simulator/services/graph";
import { loadIncidentManifests } from "@/lib/dataset/load-incident-manifests";
import { loadRunbookFiles } from "@/lib/documents/load-runbook-files";
import { getEmbeddingProvider } from "@/lib/gemini/index";
import type { Repository } from "@/lib/db/repository";
import type { DocumentRecord } from "@/lib/types";

export async function seedServiceTopology(repository: Repository): Promise<{ services: number; dependencies: number }> {
  for (const service of SERVICES) {
    await repository.upsertService(service);
  }
  for (const dependency of SERVICE_DEPENDENCIES) {
    await repository.upsertServiceDependency(dependency);
  }
  return { services: SERVICES.length, dependencies: SERVICE_DEPENDENCIES.length };
}

export async function seedIncidentDataset(
  repository: Repository,
): Promise<{ incidents: number; logEvents: number; metricEvents: number }> {
  const manifests = loadIncidentManifests();

  let logEventCount = 0;
  let metricEventCount = 0;

  for (const manifest of manifests) {
    await repository.upsertIncident(manifest.incident);
    if (manifest.logEvents.length > 0) {
      await repository.insertLogEvents(manifest.logEvents);
      logEventCount += manifest.logEvents.length;
    }
    if (manifest.metricEvents.length > 0) {
      await repository.insertMetricEvents(manifest.metricEvents);
      metricEventCount += manifest.metricEvents.length;
    }
  }

  return { incidents: manifests.length, logEvents: logEventCount, metricEvents: metricEventCount };
}

export async function seedRunbookDocuments(
  repository: Repository,
): Promise<{ runbooks: number; serviceDescriptions: number }> {
  const files = loadRunbookFiles();
  if (files.length === 0) {
    return { runbooks: 0, serviceDescriptions: 0 };
  }

  const embeddingProvider = getEmbeddingProvider();
  const vectors = await embeddingProvider.embed(files.map((f) => `${f.title} ${f.body}`));

  let runbookCount = 0;
  let serviceDescriptionCount = 0;

  for (const [i, file] of files.entries()) {
    const document: DocumentRecord = {
      id: file.id,
      title: file.title,
      body: file.body,
      docType: file.docType,
      embedding: vectors[i] ?? null,
    };
    await repository.upsertDocument(document);

    if (file.docType === "runbook") runbookCount += 1;
    else serviceDescriptionCount += 1;
  }

  return { runbooks: runbookCount, serviceDescriptions: serviceDescriptionCount };
}

/**
 * Populates a repository with the full demo dataset (service topology,
 * generated incidents with events, embedded runbooks). Used both by the
 * `npm run seed` CLI script and by lib/db/index.ts to auto-seed the
 * in-memory repository, since that repository is process-local and would
 * otherwise stay empty for the lifetime of a `next dev`/`next start`
 * server that nothing ever explicitly seeds.
 */
export async function seedDataset(repository: Repository): Promise<void> {
  await seedServiceTopology(repository);
  await seedIncidentDataset(repository);
  await seedRunbookDocuments(repository);
}
