import { Prisma } from '@prisma/client';
import { Team } from '@prisma/client';
import { Competition } from '@prisma/client';

export interface SerializedMatch {
  id: string;
  externalId: string;
  homeTeamId: string;
  awayTeamId: string;
  competitionId: string | null;
  matchday: number;
  matchDate: Date;
  status: string;
  previousStatus: string | null;
  homeScore: number | null;
  awayScore: number | null;
  halfTimeHome: number | null;
  halfTimeAway: number | null;
  updatedAt: Date;
  // Computed fields for frontend compatibility
  homeTeam: string;
  awayTeam: string;
  homeCrest: string | null;
  awayCrest: string | null;
  league: string;
  competition: {
    id: string;
    name: string;
    emoji: string | null;
    logoUrl: string | null;
  } | null;
}

export const serializeMatch = (match: Prisma.MatchGetPayload<{
  include: { homeTeam: true; awayTeam: true; competition: true };
}>): SerializedMatch => {
  return {
    id: match.id,
    externalId: match.externalId,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    competitionId: match.competitionId,
    matchday: match.matchday,
    matchDate: match.matchDate,
    status: match.status,
    previousStatus: match.previousStatus,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    halfTimeHome: match.halfTimeHome,
    halfTimeAway: match.halfTimeAway,
    updatedAt: match.updatedAt,
    homeTeam: match.homeTeam.name,
    awayTeam: match.awayTeam.name,
    homeCrest: match.homeTeam.logoUrl,
    awayCrest: match.awayTeam.logoUrl,
    league: match.league ?? match.competition?.name ?? 'Unknown',
    competition: match.competition ? {
      id: match.competition.id,
      name: match.competition.name,
      emoji: match.competition.emoji,
      logoUrl: match.competition.logoUrl,
    } : null,
  };
};