import { BasicTeamStats } from './team-basic-stats.types';
import { TeamFormStats } from './team-form.types';
import { TeamHomeAwayStats } from './team-home-away.types';
import { ScoreDistribution } from './score-distribution.utils';

export interface TeamProfile {
  teamId: string;
  basicStats: BasicTeamStats;
  form: TeamFormStats;
  homeAway: TeamHomeAwayStats;
  scoreDistribution: ScoreDistribution;
}
