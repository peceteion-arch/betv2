import { getBasicTeamStats } from './team-basic-stats.features';
import { getTeamFormStats } from './team-form.features';
import { getTeamHomeAwayStats } from './team-home-away.features';
import { TeamProfile } from './team-profile.types';

/**
 * Aggregates various statistics for a given team into a single profile.
 * Executes calculation functions in parallel for performance.
 */
export async function getTeamProfile(teamId: string): Promise<TeamProfile> {
  const [basicStats, form, homeAway] = await Promise.all([
    getBasicTeamStats(teamId),
    getTeamFormStats(teamId),
    getTeamHomeAwayStats(teamId),
  ]);

  return {
    teamId,
    basicStats,
    form,
    homeAway,
  };
}
