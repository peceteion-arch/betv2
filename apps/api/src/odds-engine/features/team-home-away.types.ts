import { BasicTeamStats } from './team-basic-stats.types';

export interface TeamHomeAwayStats {
  teamId: string;
  home: BasicTeamStats;
  away: BasicTeamStats;
}
