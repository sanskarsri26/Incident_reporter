/**
 * Deterministic pseudo-random helpers for the simulator.
 *
 * The simulator must never call `Math.random()` directly: all generated
 * data needs to be reproducible from an incident id + start time so that
 * tests and the eval harness see stable data across runs.
 */

/** mulberry32: small, fast, seeded PRNG. Returns a function producing floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a style string hash, used to turn incident ids / salts into numeric seeds. */
export function hashStringToSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Build a deterministic RNG scoped to an incident + a named purpose (a "salt"). */
export function seededRng(incidentId: string, salt: string): () => number {
  return mulberry32(hashStringToSeed(`${incidentId}::${salt}`));
}
