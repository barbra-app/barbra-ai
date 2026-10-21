// Shared between server (bigquery-analytics-repository.ts) and client
// (campaign status dots in the event selector) so both sides resolve a
// campaign_name to the same concert.
function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Same anchoring as the BigQuery-side anchoredPattern(): case-insensitive,
// matches from the start of the campaign name up to a separator or the end.
export function matchesConcert(campaignName: string, namePatterns: string[]) {
  const trimmedCampaignName = campaignName.trim();
  return namePatterns.some((namePattern) =>
    new RegExp(`^${escapeRegExp(namePattern.trim())}($|[_ ])`, "i").test(trimmedCampaignName),
  );
}
