import { describe, it, expect } from 'vitest';

describe('Zod schemas', () => {
  it('placeBetSchema validates correct data', async () => {
    const { placeBetSchema } = await import('../src/config/env');
    const result = placeBetSchema.safeParse({
      stake: 10,
      selections: [{ matchId: 'cm123', market: '1X2', selection: '1', odds: 1.9 }],
    });
    expect(result.success).toBe(true);
  });

  it('placeBetSchema rejects empty selections', async () => {
    const { placeBetSchema } = await import('../src/config/env');
    const result = placeBetSchema.safeParse({ stake: 10, selections: [] });
    expect(result.success).toBe(false);
  });

  it('placeBetSchema rejects stake < 1', async () => {
    const { placeBetSchema } = await import('../src/config/env');
    const result = placeBetSchema.safeParse({
      stake: 0,
      selections: [{ matchId: 'cm1', market: '1X2', selection: '1', odds: 1.9 }],
    });
    expect(result.success).toBe(false);
  });

  it('paginationSchema has defaults', async () => {
    const { paginationSchema } = await import('../src/config/env');
    const result = paginationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
      expect(result.data.cursor).toBeUndefined();
    }
  });

  it('paginationSchema parses cursor', async () => {
    const { paginationSchema } = await import('../src/config/env');
    const result = paginationSchema.safeParse({ cursor: 'abc123', limit: 10 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cursor).toBe('abc123');
      expect(result.data.limit).toBe(10);
    }
  });

  it('createManualMatchSchema validates correct data', async () => {
    const { createManualMatchSchema } = await import('../src/config/env');
    const result = createManualMatchSchema.safeParse({
      homeTeamId: 't1',
      awayTeamId: 't2',
      competitionId: 'c1',
      matchday: 1,
      matchDate: '2026-10-01T20:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('createManualMatchSchema rejects missing fields', async () => {
    const { createManualMatchSchema } = await import('../src/config/env');
    expect(
      createManualMatchSchema.safeParse({
        homeTeamId: 't1',
        awayTeamId: 't2',
        competitionId: 'c1',
        matchday: 1,
      }).success,
    ).toBe(false);
  });

  // The admin form uses <input type="datetime-local">, which submits
  // '2026-10-01T20:00' — no seconds, no timezone. A strict ISO check would
  // reject every manually created match.
  it('createManualMatchSchema accepts a naive datetime-local value', async () => {
    const { createManualMatchSchema } = await import('../src/config/env');
    const result = createManualMatchSchema.safeParse({
      homeTeamId: 't1',
      awayTeamId: 't2',
      competitionId: 'c1',
      matchday: 1,
      matchDate: '2026-10-01T20:00',
    });
    expect(result.success).toBe(true);
  });

  it('createManualMatchSchema rejects an unparseable date', async () => {
    const { createManualMatchSchema } = await import('../src/config/env');
    const result = createManualMatchSchema.safeParse({
      homeTeamId: 't1',
      awayTeamId: 't2',
      competitionId: 'c1',
      matchday: 1,
      matchDate: 'nao-e-uma-data',
    });
    expect(result.success).toBe(false);
  });

  it('updateScoreSchema validates correct data', async () => {
    const { updateScoreSchema } = await import('../src/config/env');
    const result = updateScoreSchema.safeParse({ homeScore: 3, awayScore: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('FINISHED');
    }
  });

  it('updateScoreSchema rejects negative and fractional scores', async () => {
    const { updateScoreSchema } = await import('../src/config/env');
    expect(updateScoreSchema.safeParse({ homeScore: -1, awayScore: 0 }).success).toBe(false);
    expect(updateScoreSchema.safeParse({ homeScore: 1.5, awayScore: 0 }).success).toBe(false);
  });

  it('updateScoreSchema accepts only statuses a score can be recorded on', async () => {
    const { updateScoreSchema } = await import('../src/config/env');
    expect(updateScoreSchema.safeParse({ homeScore: 0, awayScore: 0, status: 'LIVE' }).success).toBe(true);
    expect(updateScoreSchema.safeParse({ homeScore: 0, awayScore: 0, status: 'FINISHED' }).success).toBe(true);
    expect(updateScoreSchema.safeParse({ homeScore: 0, awayScore: 0, status: 'SCHEDULED' }).success).toBe(false);
    expect(updateScoreSchema.safeParse({ homeScore: 0, awayScore: 0, status: 'CANCELLED' }).success).toBe(false);
  });

  it('updateScoreSchema rejects VOID, which has its own route', async () => {
    const { updateScoreSchema } = await import('../src/config/env');
    // voidMatch() is deliberately a separate two-step act; reaching VOID
    // through the score route would skip the checks it performs.
    expect(updateScoreSchema.safeParse({ homeScore: 0, awayScore: 0, status: 'VOID' }).success).toBe(false);
  });

  // updateMatch — the admin "edit match" payload. It mirrors
  // createManualMatchSchema for the identity/date fields and adds the
  // same home/away distinctness constraint and the datetime-local date form.
  it('updateMatchSchema accepts a valid edit payload', async () => {
    const { updateMatchSchema } = await import('../src/config/env');
    const result = updateMatchSchema.safeParse({
      homeTeamId: 't1',
      awayTeamId: 't2',
      competitionId: 'c1',
      matchday: 3,
      matchDate: '2026-10-01T20:00',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.competitionId).toBe('c1');
  });

  it('updateMatchSchema accepts an edit without a competition', async () => {
    const { updateMatchSchema } = await import('../src/config/env');
    const result = updateMatchSchema.safeParse({
      homeTeamId: 't1',
      awayTeamId: 't2',
      matchday: 1,
      matchDate: '2026-10-01T20:00',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.competitionId).toBeUndefined();
  });

  it('updateMatchSchema rejects home === away', async () => {
    const { updateMatchSchema } = await import('../src/config/env');
    const result = updateMatchSchema.safeParse({
      homeTeamId: 't1',
      awayTeamId: 't1',
      matchday: 1,
      matchDate: '2026-10-01T20:00',
    });
    expect(result.success).toBe(false);
  });

  it('updateMatchSchema rejects matchday < 1', async () => {
    const { updateMatchSchema } = await import('../src/config/env');
    const result = updateMatchSchema.safeParse({
      homeTeamId: 't1',
      awayTeamId: 't2',
      matchday: 0,
      matchDate: '2026-10-01T20:00',
    });
    expect(result.success).toBe(false);
  });

  it('updateMatchSchema rejects a fractional matchday', async () => {
    const { updateMatchSchema } = await import('../src/config/env');
    const result = updateMatchSchema.safeParse({
      homeTeamId: 't1',
      awayTeamId: 't2',
      matchday: 1.5,
      matchDate: '2026-10-01T20:00',
    });
    expect(result.success).toBe(false);
  });

  it('updateMatchSchema rejects an unparseable date', async () => {
    const { updateMatchSchema } = await import('../src/config/env');
    const result = updateMatchSchema.safeParse({
      homeTeamId: 't1',
      awayTeamId: 't2',
      matchday: 1,
      matchDate: 'nao-e-uma-data',
    });
    expect(result.success).toBe(false);
  });
});

describe('SCOREABLE_MATCH_STATUSES', () => {
  it('is exactly LIVE and FINISHED', async () => {
    const { SCOREABLE_MATCH_STATUSES } = await import('../src/config/env');
    expect([...SCOREABLE_MATCH_STATUSES].sort()).toEqual(['FINISHED', 'LIVE']);
  });

  it('excludes every status that would reopen a match or bypass a guard', async () => {
    const { SCOREABLE_MATCH_STATUSES } = await import('../src/config/env');
    const excluded = ['SCHEDULED', 'VOID', 'POSTPONED', 'CANCELLED'];
    for (const status of excluded) {
      expect(SCOREABLE_MATCH_STATUSES.includes(status as never)).toBe(false);
    }
  });
});