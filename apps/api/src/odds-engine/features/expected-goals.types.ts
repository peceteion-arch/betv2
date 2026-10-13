export interface ExpectedGoalsResult {
  home: {
    teamId: string;
    lambdaHome: number | null;
    matchesUsed: number;
  };
  away: {
    teamId: string;
    lambdaAway: number | null;
    matchesUsed: number;
  };
}
