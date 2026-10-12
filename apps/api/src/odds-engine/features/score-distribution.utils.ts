export interface ExactScoreFrequency {
  goalsFor: number;
  goalsAgainst: number;
  count: number;
  rate: number;
}

export interface ScoreDistribution {
  matchesTotal: number;
  scorelines: ExactScoreFrequency[];
}

export function calculateScoreDistribution(
  matches: { goalsFor: number | null | undefined; goalsAgainst: number | null | undefined }[]
): ScoreDistribution {
  const validMatches = matches.filter(
    (m): m is { goalsFor: number; goalsAgainst: number } =>
      typeof m.goalsFor === 'number' &&
      Number.isFinite(m.goalsFor) &&
      m.goalsFor >= 0 &&
      typeof m.goalsAgainst === 'number' &&
      Number.isFinite(m.goalsAgainst) &&
      m.goalsAgainst >= 0
  );

  const matchesTotal = validMatches.length;
  if (matchesTotal === 0) {
    return { matchesTotal: 0, scorelines: [] };
  }

  const freqMap = new Map<string, number>();

  for (const match of validMatches) {
    const key = `${match.goalsFor}-${match.goalsAgainst}`;
    freqMap.set(key, (freqMap.get(key) || 0) + 1);
  }

  const scorelines: ExactScoreFrequency[] = [];
  for (const [key, count] of freqMap.entries()) {
    const [goalsFor, goalsAgainst] = key.split('-').map(Number);
    scorelines.push({
      goalsFor,
      goalsAgainst,
      count,
      rate: count / matchesTotal,
    });
  }

  scorelines.sort((a, b) => a.goalsFor - b.goalsFor || a.goalsAgainst - b.goalsAgainst);

  return { matchesTotal, scorelines };
}
