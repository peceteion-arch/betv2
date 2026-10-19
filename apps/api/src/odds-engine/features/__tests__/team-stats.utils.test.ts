import { describe, it, expect } from 'vitest';
import { summarizeMatches } from '../team-stats.utils';
import { NormalizedMatch } from '../../providers/match-history.types';

function makeMatch(overrides: Partial<NormalizedMatch> = {}): NormalizedMatch {
  return {
    matchId: 'm1',
    homeTeamId: 'team-1',
    awayTeamId: 'team-2',
    homeTeamName: 'Home',
    awayTeamName: 'Away',
    competitionId: null,
    matchday: 1,
    matchDate: new Date('2023-01-01'),
    status: 'FINISHED',
    homeScore: 0,
    awayScore: 0,
    ...overrides,
  };
}

describe('summarizeMatches', () => {
  it('should calculate stats correctly for a small set of matches', () => {
    const teamId = 'team-1';
    const matches: NormalizedMatch[] = [
      makeMatch({
        matchId: 'm1',
        homeTeamId: 'team-1',
        awayTeamId: 'team-2',
        homeScore: 2,
        awayScore: 1,
        matchDate: new Date('2023-01-01'),
      }), // Win, 2-1, BTTS, Over 1.5, Over 2.5
      makeMatch({
        matchId: 'm2',
        homeTeamId: 'team-3',
        awayTeamId: 'team-1',
        homeScore: 0,
        awayScore: 3,
        matchDate: new Date('2023-01-02'),
      }), // Win, 3-0, Clean Sheet, Over 1.5, Over 2.5
      makeMatch({
        matchId: 'm3',
        homeTeamId: 'team-1',
        awayTeamId: 'team-4',
        homeScore: 0,
        awayScore: 0,
        matchDate: new Date('2023-01-03'),
      }), // Draw, 0-0, Clean Sheet
      makeMatch({
        matchId: 'm4',
        homeTeamId: 'team-5',
        awayTeamId: 'team-1',
        homeScore: 4,
        awayScore: 0,
        matchDate: new Date('2023-01-04'),
      }), // Loss, 0-4, Over 1.5, Over 2.5, Over 3.5
    ];

    const stats = summarizeMatches(matches, teamId);

    expect(stats.matches).toBe(4);
    expect(stats.wins).toBe(2);
    expect(stats.draws).toBe(1);
    expect(stats.losses).toBe(1);
    expect(stats.points).toBe(7);
    expect(stats.goalsFor).toBe(5);
    expect(stats.goalsAgainst).toBe(5);
    expect(stats.cleanSheets).toBe(2);
    expect(stats.failedToScore).toBe(2);
    expect(stats.bttsYes).toBe(1);
    expect(stats.over15).toBe(3);
    expect(stats.over25).toBe(3);
    expect(stats.over35).toBe(1);
  });

  it('should return 0 matches and null rates for an empty match set', () => {
    const stats = summarizeMatches([], 'team-1');

    expect(stats.matches).toBe(0);
    expect(stats.pointsPerMatch).toBeNull();
    expect(stats.goalsForPerMatch).toBeNull();
    expect(stats.cleanSheetRate).toBeNull();
    expect(stats.bttsRate).toBeNull();
  });

  it('should ignore corrupt rows where homeTeamId === awayTeamId === teamId', () => {
    const teamId = 'team-1';
    const matches: NormalizedMatch[] = [
      makeMatch({
        matchId: 'm1',
        homeTeamId: 'team-1',
        awayTeamId: 'team-1',
        homeScore: 1,
        awayScore: 1,
        matchDate: new Date('2023-01-01'),
      }),
    ];

    const stats = summarizeMatches(matches, teamId);
    expect(stats.matches).toBe(0);
  });
});
