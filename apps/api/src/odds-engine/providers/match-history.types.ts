export interface NormalizedMatch {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  competitionId: string | null;
  matchday: number;
  matchDate: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
}
