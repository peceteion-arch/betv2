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
  matches: { goalsFor: number; goalsAgainst: number }[]
): ScoreDistribution {
  const matchesTotal = matches.length;
  if (matchesTotal === 0) {
    return { matchesTotal: 0, scorelines: [] };
  }

  const freqMap = new Map<string, number>();

  for (const match of matches) {
    if (!Number.isFinite(match.goalsFor) || !Number.isFinite(match.goalsAgainst) || 
        match.goalsFor < 0 || match.goalsAgainst < 0) {
      continue;
    }
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
