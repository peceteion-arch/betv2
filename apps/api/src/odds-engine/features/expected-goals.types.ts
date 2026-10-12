export interface ExpectedGoals {
  teamId: string;
  expectedGoalsFor: number | null;
  expectedGoalsAgainst: number | null;
  matchesUsed: number;
}

export interface ExpectedGoalsResult {
  home: ExpectedGoals;
  away: ExpectedGoals;
}
