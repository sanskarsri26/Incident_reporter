export function evidenceTagMatches(tag: string, summary: string): boolean {
  const keywords = tag
    .split("_")
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 2);
  if (keywords.length === 0) return false;

  const lowerSummary = summary.toLowerCase();
  const matchedCount = keywords.filter((keyword) => lowerSummary.includes(keyword)).length;
  return matchedCount >= Math.ceil(keywords.length / 2);
}
