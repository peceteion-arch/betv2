export interface H2HStats {
  teamAId: string;
  teamBId: string;

  matches: number;

  teamAWins: number;
  draws: number;
  teamBWins: number;

  teamAGoals: number;
  teamBGoals: number;

  teamAGoalsPerMatch: number | null;
  teamBGoalsPerMatch: number | null;

  teamAWinRate: number | null;
  drawRate: number | null;
  teamBWinRate: number | null;

  averageTotalGoals: number | null;
}