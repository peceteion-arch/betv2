import { TeamProfile } from './team-profile.types';
import { H2HStats } from './h2h-stats.types';

export interface MatchupProfile {
  teamA: TeamProfile;
  teamB: TeamProfile;
  h2h: H2HStats;
}
