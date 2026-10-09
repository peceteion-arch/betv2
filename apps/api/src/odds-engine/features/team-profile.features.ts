import { getBasicTeamStats } from './team-basic-stats.features';
import { getTeamFormStats } from './team-form.features';
import { getTeamHomeAwayStats } from './team-home-away.features';
import { TeamProfile } from './team-profile.types';

/**
 * Aggregates various statistics for a given team into a single profile.
 * Executes calculation functions in parallel for performance.
 */
export async function getTeamProfile(teamId: string, asOf: Date): Promise<TeamProfile> {
  const [basicStats, form, homeAway] = await Promise.all([
    getBasicTeamStats(teamId, asOf),
    getTeamFormStats(teamId, asOf),
    getTeamHomeAwayStats(teamId, asOf),
  ]);

  return {
    teamId,
    basicStats,
    form,
    homeAway,
  };
}
