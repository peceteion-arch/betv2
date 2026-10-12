export interface BasicTeamStats {
  teamId: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  pointsPerMatch: number | null;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  goalsForPerMatch: number | null;
  goalsAgainstPerMatch: number | null;
  goalDifferencePerMatch: number | null;
  cleanSheets: number;
  cleanSheetRate: number | null;
  failedToScore: number;
  failedToScoreRate: number | null;
  bttsYes: number;
  bttsRate: number | null;
  over15: number;
  over15Rate: number | null;
  over25: number;
  over25Rate: number | null;
  over35: number;
  over35Rate: number | null;
}