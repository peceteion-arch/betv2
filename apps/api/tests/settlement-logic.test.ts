import { describe, it, expect } from 'vitest';
import { checkSelectionOutcome, evaluateBet, type BetSelectionInput } from '../src/lib/settlement';

// These tests import the real implementation from src/lib/settlement.ts.
// The previous bet-logic.test.ts re-implemented checkSelectionWon inline,
// which meant production and test could agree on the same bug and both pass.
// If a formula below is wrong in src/lib/settlement.ts, this file fails.

const match = (
  homeScore: number | null,
  awayScore: number | null,
  status = 'FINISHED',
  halfTimeHome: number | null = null,
  halfTimeAway: number | null = null
) => ({ status, homeScore, awayScore, halfTimeHome, halfTimeAway });

const leg = (
  market: string,
  selection: string,
  odds: number,
  m: ReturnType<typeof match>
): BetSelectionInput => ({ market, selection, odds, match: m });

describe('checkSelectionOutcome — core markets', () => {
  it('1X2 resolves win / draw / loss', () => {
    const m = match(2, 1);
    expect(checkSelectionOutcome('1X2', '1', m)).toBe('WON');
    expect(checkSelectionOutcome('1X2', 'X', m)).toBe('LOST');
    expect(checkSelectionOutcome('1X2', '2', m)).toBe('LOST');

    const d = match(1, 1);
    expect(checkSelectionOutcome('1X2', 'X', d)).toBe('WON');
  });

  it('DUPLA_HIPOTESE includes the draw', () => {
    const m = match(2, 1);
    expect(checkSelectionOutcome('DUPLA_HIPOTESE', '1X', m)).toBe('WON');
    expect(checkSelectionOutcome('DUPLA_HIPOTESE', '12', m)).toBe('WON');
    expect(checkSelectionOutcome('DUPLA_HIPOTESE', 'X2', m)).toBe('LOST');
  });

  it('MARCAS over/under uses the stated side, never the opposite', () => {
    const total3 = match(2, 1);
    expect(checkSelectionOutcome('MARCAS_2_5', 'Mais 2.5', total3)).toBe('WON');
    expect(checkSelectionOutcome('MARCAS_2_5', 'Menos 2.5', total3)).toBe('LOST');

    // A selection that does not belong to this market must NOT be silently
    // evaluated as the opposite side. The old ternary did exactly that.
    expect(checkSelectionOutcome('MARCAS_2_5', 'Mais 3.5', total3)).toBe('VOID');
  });

  it('unknown market or selection is VOID, never LOST', () => {
    const m = match(2, 1);
    expect(checkSelectionOutcome('NOT_A_MARKET', 'whatever', m)).toBe('VOID');
    expect(checkSelectionOutcome('1X2', 'Z', m)).toBe('VOID');
  });
});

describe('FINISHED without a score is not a loss', () => {
  it('returns UNRESOLVED when either score is missing', () => {
    expect(checkSelectionOutcome('1X2', '1', match(null, null))).toBe('UNRESOLVED');
    expect(checkSelectionOutcome('1X2', '1', match(2, null))).toBe('UNRESOLVED');
    expect(checkSelectionOutcome('1X2', '1', match(null, 1))).toBe('UNRESOLVED');
  });

  it('a ticket with an undecided leg stays PENDING', () => {
    const result = evaluateBet(
      [leg('1X2', '1', 1.8, match(2, 1)), leg('1X2', '2', 3.0, match(null, null))],
      10
    );
    expect(result.status).toBe('PENDING');
    expect(result.effectivePotentialReturn).toBe(0);
  });
});

describe('RESULTADO_INTERVALO stays undetermined without half-time data', () => {
  it('is UNRESOLVED, not VOID and not LOST', () => {
    const m = match(2, 1, 'FINISHED', null, null);
    expect(checkSelectionOutcome('RESULTADO_INTERVALO', '1', m)).toBe('UNRESOLVED');
  });

  it('settles normally when half-time scores exist', () => {
    const m = match(2, 1, 'FINISHED', 1, 0);
    expect(checkSelectionOutcome('RESULTADO_INTERVALO', '1', m)).toBe('WON');
    expect(checkSelectionOutcome('RESULTADO_INTERVALO', '2', m)).toBe('LOST');
  });
});

describe('handicap formulas', () => {
  // Labels come from odds_engine.py: "Casa {line}" / "Fora {abs(line)}".
  // The line is read from the label, and the sign is applied to whichever
  // team the label names — never flipped just because the team is Away.

  it('negative handicap, home leg (Casa -1.5)', () => {
    // home - 1.5 > away
    expect(checkSelectionOutcome('HANDICAP_n1_5', 'Casa -1.5', match(3, 1))).toBe('WON');
    expect(checkSelectionOutcome('HANDICAP_n1_5', 'Casa -1.5', match(2, 1))).toBe('LOST');
  });

  it('negative handicap, away leg (Fora 1.5) — the away side receives +1.5', () => {
    // away + 1.5 > home  ->  1 + 1.5 = 2.5 > 2  WON
    // The old code computed (away - 1.5) > home, i.e. -0.5 > 2, and lost.
    expect(checkSelectionOutcome('HANDICAP_n1_5', 'Fora 1.5', match(2, 1))).toBe('WON');
    expect(checkSelectionOutcome('HANDICAP_n1_5', 'Fora 1.5', match(4, 1))).toBe('LOST');
  });

  it('negative half-line, home leg (Casa -0.5)', () => {
    // home - 0.5 > away  -> a draw loses, a home win wins
    expect(checkSelectionOutcome('HANDICAP_n0_5', 'Casa -0.5', match(2, 1))).toBe('WON');
    expect(checkSelectionOutcome('HANDICAP_n0_5', 'Casa -0.5', match(1, 1))).toBe('LOST');
  });

  it('negative half-line, away leg (Fora 0.5)', () => {
    // away + 0.5 > home  -> a draw wins for the away side
    expect(checkSelectionOutcome('HANDICAP_n0_5', 'Fora 0.5', match(1, 1))).toBe('WON');
    expect(checkSelectionOutcome('HANDICAP_n0_5', 'Fora 0.5', match(2, 1))).toBe('LOST');
  });

  it('positive handicap, home leg (Casa 0.5) gives the home side a bonus', () => {
    // home + 0.5 > away  -> 2 + 0.5 = 2.5 > 1
    expect(checkSelectionOutcome('HANDICAP_0_5', 'Casa 0.5', match(2, 1))).toBe('WON');
    expect(checkSelectionOutcome('HANDICAP_0_5', 'Casa 0.5', match(0, 2))).toBe('LOST');
  });

  it('positive handicap, away leg (Fora 0.5)', () => {
    // away + 0.5 > home
    expect(checkSelectionOutcome('HANDICAP_0_5', 'Fora 0.5', match(0, 0))).toBe('WON');
    expect(checkSelectionOutcome('HANDICAP_0_5', 'Fora 0.5', match(2, 0))).toBe('LOST');
  });

  it('positive handicap, home leg (Casa 1.5)', () => {
    // home + 1.5 > away  -> 1 + 1.5 = 2.5 > 1
    expect(checkSelectionOutcome('HANDICAP_1_5', 'Casa 1.5', match(1, 1))).toBe('WON');
    expect(checkSelectionOutcome('HANDICAP_1_5', 'Casa 1.5', match(0, 2))).toBe('LOST');
  });

  it('HANDICAP_0_0 is a push on a draw, so it is VOID not LOST', () => {
    expect(checkSelectionOutcome('HANDICAP_0_0', 'Casa 0.0', match(1, 1))).toBe('VOID');
    expect(checkSelectionOutcome('HANDICAP_0_0', 'Fora 0.0', match(1, 1))).toBe('VOID');
    expect(checkSelectionOutcome('HANDICAP_0_0', 'Casa 0.0', match(2, 1))).toBe('WON');
    expect(checkSelectionOutcome('HANDICAP_0_0', 'Fora 0.0', match(2, 1))).toBe('LOST');
  });
});

describe('accumulator settlement with void legs', () => {
  // The headline case from the brief: A=1.80 WON, B voided, C=1.50 WON.
  const A = leg('1X2', '1', 1.8, match(2, 1));
  const B = leg('1X2', '1', 2.0, match(null, null, 'VOID'));
  const C = leg('1X2', '1', 1.5, match(3, 0));

  it('WIN + VOID + WIN pays the void leg at 1.00, not the full stake back', () => {
    const result = evaluateBet([A, B, C], 10);
    expect(result.status).toBe('WON');
    expect(result.effectiveTotalOdds).toBe(2.7); // 1.80 * 1.00 * 1.50
    expect(result.effectivePotentialReturn).toBe(27);
    expect(result.voidCount).toBe(1);
    expect(result.winCount).toBe(2);
  });

  it('WIN + VOID settles as WON with a recalculated payout', () => {
    const result = evaluateBet([A, B], 10);
    expect(result.status).toBe('WON');
    expect(result.effectiveTotalOdds).toBe(1.8);
    expect(result.effectivePotentialReturn).toBe(18);
  });

  it('WIN + VOID + LOSS is LOST with no payout', () => {
    // A wins, B voided, C backs the away side on a home win and loses.
    const lost = leg('1X2', '2', 1.5, match(1, 0));
    const result = evaluateBet([A, B, lost], 10);
    expect(result.status).toBe('LOST');
    expect(result.effectivePotentialReturn).toBe(0);
  });

  it('VOID + VOID returns exactly the stake at 1.00 and is not a loss', () => {
    const result = evaluateBet([B, leg('1X2', 'X', 3.5, match(null, null, 'VOID'))], 10);
    expect(result.status).toBe('WON');
    expect(result.effectiveTotalOdds).toBe(1);
    expect(result.effectivePotentialReturn).toBe(10);
    expect(result.voidCount).toBe(2);
  });

  it('VOID + LOST is LOST', () => {
    // Backing the away side on a home win: the leg loses, the ticket loses.
    const lost = leg('1X2', '2', 2.0, match(1, 0));
    const result = evaluateBet([B, lost], 10);
    expect(result.status).toBe('LOST');
    expect(result.effectivePotentialReturn).toBe(0);
  });

  it('all WIN is unchanged by the void logic', () => {
    const result = evaluateBet(
      [leg('1X2', '1', 1.8, match(2, 1)), leg('1X2', '1', 1.5, match(3, 0))],
      10
    );
    expect(result.status).toBe('WON');
    expect(result.effectiveTotalOdds).toBe(2.7);
    expect(result.effectivePotentialReturn).toBe(27);
    expect(result.voidCount).toBe(0);
  });

  it('a POSTPONED match voids its leg like an explicit VOID', () => {
    const postponed = leg('1X2', '1', 2.0, match(null, null, 'POSTPONED'));
    const result = evaluateBet([A, postponed], 10);
    expect(result.status).toBe('WON');
    expect(result.effectiveTotalOdds).toBe(1.8);
    expect(result.effectivePotentialReturn).toBe(18);
  });

  it('a match that has not finished keeps the ticket PENDING', () => {
    const live = leg('1X2', '1', 2.0, match(0, 0, 'LIVE'));
    const result = evaluateBet([A, live], 10);
    expect(result.status).toBe('PENDING');
    expect(result.effectivePotentialReturn).toBe(0);
  });

  it('a void leg never wipes out a winning accumulator', () => {
    const result = evaluateBet([A, B, C], 10);
    expect(result.status).not.toBe('LOST');
    expect(result.status).not.toBe('PENDING');
    // 27.00 is the payout, not a 10.00 refund.
    expect(result.effectivePotentialReturn).toBeGreaterThan(10);
  });

  it('keeps payout at 2 decimals on fractional odds', () => {
    const a = leg('1X2', '1', 1.955, match(2, 1));
    const b = leg('1X2', '1', 1.871, match(3, 0));
    const result = evaluateBet([a, b], 100);
    // 1.955 * 1.871 = 3.657805 -> 3.66 ; 100 * 3.66 = 366.00
    expect(result.effectiveTotalOdds).toBe(3.66);
    expect(result.effectivePotentialReturn).toBe(366);
  });
});
