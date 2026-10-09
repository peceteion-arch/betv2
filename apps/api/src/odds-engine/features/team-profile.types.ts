import { BasicTeamStats } from './team-basic-stats.types';
import { TeamFormStats } from './team-form.types';
import { TeamHomeAwayStats } from './team-home-away.types';

export interface TeamProfile {
  teamId: string;
  basicStats: BasicTeamStats;
  form: TeamFormStats;
  homeAway: TeamHomeAwayStats;
}
