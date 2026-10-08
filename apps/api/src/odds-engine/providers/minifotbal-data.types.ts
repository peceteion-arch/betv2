export interface MinifotbalTeam {
  id: number;
  name: string;
  leagueId: number | null;
}

export interface MinifotbalPlayer {
  id: number;
  firstName: string;
  lastName: string;
  teamId: number | null;
  status: string | null;
}

export interface MinifotbalEvent {
  id: number;
  playerId: number;
  teamId: number | null;
  stage: number | null;
  type: string;
  note: string | null;
}
