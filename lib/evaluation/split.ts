export type SplitName = "dev" | "validation" | "test";

export interface SplitAssignment {
  incidentId: string;
  split: SplitName;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export interface StratifiedSplitOptions {
  devFraction?: number;
  validationFraction?: number;
  seed?: number;
}

export function createStratifiedSplit(
  incidents: Array<{ id: string; fault: string }>,
  options: StratifiedSplitOptions = {},
): SplitAssignment[] {
  const devFraction = options.devFraction ?? 0.6;
  const validationFraction = options.validationFraction ?? 0.2;
  const seed = options.seed ?? 42;

  const byFault = new Map<string, Array<{ id: string; fault: string }>>();
  for (const incident of incidents) {
    const group = byFault.get(incident.fault) ?? [];
    group.push(incident);
    byFault.set(incident.fault, group);
  }

  const assignments: SplitAssignment[] = [];

  for (const [fault, group] of byFault) {
    const rng = mulberry32(hashSeed(`${seed}:${fault}`));
    const shuffled = [...group];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const temp = shuffled[i]!;
      shuffled[i] = shuffled[j]!;
      shuffled[j] = temp;
    }

    const devCount = Math.round(shuffled.length * devFraction);
    const validationCount = Math.round(shuffled.length * validationFraction);

    shuffled.forEach((incident, index) => {
      const split: SplitName = index < devCount ? "dev" : index < devCount + validationCount ? "validation" : "test";
      assignments.push({ incidentId: incident.id, split });
    });
  }

  return assignments;
}
