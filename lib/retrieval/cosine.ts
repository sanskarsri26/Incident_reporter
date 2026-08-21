export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < length; i += 1) {
    const valueA = a[i] ?? 0;
    const valueB = b[i] ?? 0;
    dot += valueA * valueB;
    magA += valueA * valueA;
    magB += valueB * valueB;
  }
  const denominator = Math.sqrt(magA) * Math.sqrt(magB);
  if (denominator === 0) return 0;
  // Mathematically bounded to [-1, 1], but float accumulation over long
  // vectors can push the raw result a hair past 1 (observed:
  // 1.0000000000000002) -- callers render this as a percentage
  // (app/incidents/[id]/similar/page.tsx), where that reads as a bug.
  return Math.max(-1, Math.min(1, dot / denominator));
}
