export interface BasicTeamStats {
  teamId: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  pointsPerMatch: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  goalsForPerMatch: number;
  goalsAgainstPerMatch: number;
  goalDifferencePerMatch: number;
  cleanSheets: number;
  cleanSheetRate: number;
  failedToScore: number;
  failedToScoreRate: number;
  bttsYes: number;
  bttsRate: number;
  over15: number;
  over15Rate: number;
  over25: number;
  over25Rate: number;
  over35: number;
  over35Rate: number;
}