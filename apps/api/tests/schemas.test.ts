import { describe, it, expect } from 'vitest';

describe('Zod schemas', () => {
  it('placeBetSchema validates correct data', async () => {
    const { placeBetSchema } = await import('../src/config/env');
    const result = placeBetSchema.safeParse({
      stake: 10,
      selections: [{ matchId: 'cm123', market: '1X2', selection: '1' }],
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
      selections: [{ matchId: 'cm1', market: '1X2', selection: '1' }],
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
      homeTeam: 'FC Nando',
      awayTeam: 'Sporting Galati',
      league: 'Minifotbal',
      matchDate: '2026-10-01T20:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('createManualMatchSchema defaults league to Minifotbal', async () => {
    const { createManualMatchSchema } = await import('../src/config/env');
    const result = createManualMatchSchema.safeParse({
      homeTeam: 'FC Nando',
      awayTeam: 'Sporting Galati',
      matchDate: '2026-10-01T20:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.league).toBe('Minifotbal');
    }
  });

  // The admin form uses <input type="datetime-local">, which submits
  // '2026-10-01T20:00' — no seconds, no timezone. A strict ISO check would
  // reject every manually created match.
  it('createManualMatchSchema accepts a naive datetime-local value', async () => {
    const { createManualMatchSchema } = await import('../src/config/env');
    const result = createManualMatchSchema.safeParse({
      homeTeam: 'FC Nando',
      awayTeam: 'Sporting Galati',
      league: 'Minifotbal',
      matchDate: '2026-10-01T20:00',
    });
    expect(result.success).toBe(true);
  });

  it('createManualMatchSchema rejects an unparseable date', async () => {
    const { createManualMatchSchema } = await import('../src/config/env');
    const result = createManualMatchSchema.safeParse({
      homeTeam: 'FC Nando',
      awayTeam: 'Sporting Galati',
      league: 'Minifotbal',
      matchDate: 'nao-e-uma-data',
    });
    expect(result.success).toBe(false);
  });

  it('createManualMatchSchema rejects team names outside 2-50 chars', async () => {
    const { createManualMatchSchema } = await import('../src/config/env');
    expect(
      createManualMatchSchema.safeParse({
        homeTeam: 'F', awayTeam: 'Sporting Galati', matchDate: '2026-10-01T20:00',
      }).success,
    ).toBe(false);
    expect(
      createManualMatchSchema.safeParse({
        homeTeam: 'F'.repeat(51), awayTeam: 'Sporting Galati', matchDate: '2026-10-01T20:00',
      }).success,
    ).toBe(false);
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

  it('updateScoreSchema accepts only known statuses', async () => {
    const { updateScoreSchema } = await import('../src/config/env');
    expect(updateScoreSchema.safeParse({ homeScore: 0, awayScore: 0, status: 'LIVE' }).success).toBe(true);
    expect(updateScoreSchema.safeParse({ homeScore: 0, awayScore: 0, status: 'SCHEDULED' }).success).toBe(true);
    expect(updateScoreSchema.safeParse({ homeScore: 0, awayScore: 0, status: 'CANCELLED' }).success).toBe(false);
  });
});
