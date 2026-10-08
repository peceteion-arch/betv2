export interface H2HStats {
  teamAId: string;
  teamBId: string;

  matches: number;

  teamAWins: number;
  draws: number;
  teamBWins: number;

  teamAGoals: number;
  teamBGoals: number;

  teamAGoalsPerMatch: number;
  teamBGoalsPerMatch: number;

  teamAWinRate: number;
  drawRate: number;
  teamBWinRate: number;

  averageTotalGoals: number;
}