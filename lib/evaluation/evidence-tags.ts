// Requires ALL significant (>2 char) words of a tag to appear in the
// summary, not just a majority. A majority threshold let single common
// words decide the match on their own -- e.g. "db_pool_at_limit" needs only
// "pool" OR "limit" to match at 1-of-2 rounded up, so a summary mentioning
// an unrelated "pool" (a thread pool, a connection pool on a different
// service) would count as a hit. Requiring every significant word still
// allows word order/adjacency to differ (this is a presence check, not a
// phrase match), but it stops single generic words from carrying a match
// on their own.
export function evidenceTagMatches(tag: string, summary: string): boolean {
  const keywords = tag
    .split("_")
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 2);
  if (keywords.length === 0) return false;

  const lowerSummary = summary.toLowerCase();
  return keywords.every((keyword) => lowerSummary.includes(keyword));
}
