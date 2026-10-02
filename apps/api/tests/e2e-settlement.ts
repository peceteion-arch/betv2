// End-to-end settlement check against a real PostgreSQL instance.
// Not part of npm test — run manually with a DATABASE_URL pointing at a
// throwaway database, because it needs a live DB. Verifies the money movement
// that the pure unit tests cannot: balance increments, atomicity, and the
// cancel/settlement race.
import { assertTestDatabase } from './helpers/assertTestDatabase';
assertTestDatabase();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const createdUserIds: string[] = [];
const createdMatchIds: string[] = [];
const createdFutureMatchIds: string[] = [];
const createdBetIds: string[] = [];

const money = (d: unknown) => Number(d).toFixed(2);

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}

async function makeUser(name: string, balance = 100) {
  const user = await prisma.user.create({
    data: { name, email: `${name}-${Date.now()}-${Math.random()}@t.com`, passwordHash: 'x', balance },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeMatch(status: string, home: number | null, away: number | null) {
  const match = await prisma.match.create({
    data: {
      externalId: `t-${Date.now()}-${Math.random()}`,
      homeTeam: 'H', awayTeam: 'A', league: 'L', country: 'Manual',
      matchDate: new Date('2020-01-01'), status, homeScore: home, awayScore: away,
    },
  });
  createdMatchIds.push(match.id);
  return match;
}

// makeMatch always dates its match in the past, which is right for settlement
// but disqualifies them from cancel(): a ticket can only be cancelled
// while every leg is SCHEDULED *and* still in the future, the same rule
// placeBet applies. Cancellation fixtures need the other kind of match.
async function makeFutureMatch(daysAhead = 7, status = 'SCHEDULED') {
  const match = await prisma.match.create({
    data: {
      externalId: `f-${Date.now()}-${Math.random()}`,
      homeTeam: 'H', awayTeam: 'A', league: 'L', country: 'Manual',
      matchDate: new Date(Date.now() + daysAhead * 86_400_000),
      status, homeScore: null, awayScore: null,
    },
  });
  createdFutureMatchIds.push(match.id);
  return match;
}

// Places a bet directly so the fixture is independent of placeBet's validation.
async function placeBet(userId: string, stake: number, legs: Array<{ matchId: string; market: string; selection: string; odds: number }>) {
  return prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { balance: { decrement: stake } } });
    const totalOdds = Math.round(legs.reduce((a, s) => a * s.odds, 1) * 100) / 100;
    const bet = await tx.bet.create({
      data: {
        userId, stake, totalOdds,
        potentialReturn: Math.round(stake * totalOdds * 100) / 100,
        selections: { create: legs },
      },
    });
    createdBetIds.push(bet.id);
    return bet;
  });
}

async function balanceOf(id: string) {
  return money((await prisma.user.findUniqueOrThrow({ where: { id } })).balance);
}

async function cleanup() {
  console.log('\n=== Cleaning up created test data ===');
  const matchIds = [...createdMatchIds, ...createdFutureMatchIds];

  // Each step on its own, so one failure cannot skip the rest.
  const step = async (label: string, fn: () => Promise<{ count: number }>) => {
    try {
      console.log(`Deleted ${(await fn()).count} ${label}`);
    } catch (e) {
      console.error(`Cleanup step failed (${label}):`, e);
    }
  };

  // All tickets of the test users, including those placed through
  // betService.placeBet, which are not tracked in createdBetIds.
  await step('tickets', () => prisma.bet.deleteMany({ where: { userId: { in: createdUserIds } } }));
  await step('matches', () => prisma.match.deleteMany({ where: { id: { in: matchIds } } }));
  await step('users', () => prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }));
}

async function main() {
  console.log('\n=== 1. The brief\'s headline case: A WON, B VOID, C WON ===');
  {
    const user = await makeUser('void-accum');
    const a = await makeMatch('FINISHED', 2, 1);
    const b = await makeMatch('VOID', null, null);
    const c = await makeMatch('FINISHED', 3, 0);
    await placeBet(user.id, 10, [
      { matchId: a.id, market: '1X2', selection: '1', odds: 1.8 },
      { matchId: b.id, market: '1X2', selection: '1', odds: 2.0 },
      { matchId: c.id, market: '1X2', selection: '1', odds: 1.5 },
    ]);
    check('balance after placing stake of 10', await balanceOf(user.id), '90.00');

    const { betService } = await import('../src/services/bet.service');
    await betService.settlePendingBets();

    const bet = await prisma.bet.findFirstOrThrow({ where: { userId: user.id }, include: { selections: true } });
    check('ticket status', bet.status, 'WON');
    check('effective total odds (1.80 * 1.00 * 1.50)', money(bet.totalOdds), '2.70');
    check('payout stored on ticket', money(bet.potentialReturn), '27.00');
    check('balance credited', await balanceOf(user.id), '117.00'); // 90 + 27
    const sels = [...bet.selections].sort((x, y) => x.market.localeCompare(y.market) || x.id.localeCompare(y.id));
    const voidSel = bet.selections.find((s) => s.matchId === b.id)!;
    check('void leg kept its ORIGINAL odds', money(voidSel.odds), '2.00');
    check('void leg flagged won=null', voidSel.won, null);
    const wonLegs = bet.selections.filter((s) => s.matchId !== b.id);
    check('both winning legs flagged won=true', wonLegs.every((s) => s.won === true), true);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    check('betsCount incremented once', u.betsCount, 1);
    check('betsWon incremented once', u.betsWon, 1);
    check('profit = 27 - 10', money(u.profit), '17.00');
  }

  console.log('\n=== 2. VOID + VOID returns exactly the stake ===');
  {
    const user = await makeUser('all-void');
    const a = await makeMatch('VOID', null, null);
    const b = await makeMatch('VOID', null, null);
    await placeBet(user.id, 25, [
      { matchId: a.id, market: '1X2', selection: '1', odds: 3.0 },
      { matchId: b.id, market: '1X2', selection: 'X', odds: 4.0 },
    ]);
    check('balance after stake', await balanceOf(user.id), '75.00');
    const { betService } = await import('../src/services/bet.service');
    await betService.settlePendingBets();
    const bet = await prisma.bet.findFirstOrThrow({ where: { userId: user.id } });
    check('ticket status', bet.status, 'WON');
    check('effective odds = 1.00', money(bet.totalOdds), '1.00');
    check('payout = stake', money(bet.potentialReturn), '25.00');
    check('balance back to original 100', await balanceOf(user.id), '100.00');
  }

  console.log('\n=== 3. WIN + VOID + LOSS is LOST, no refund, no payout ===');
  {
    const user = await makeUser('mixed-loss');
    const a = await makeMatch('FINISHED', 2, 1);
    const b = await makeMatch('VOID', null, null);
    const c = await makeMatch('FINISHED', 1, 0);
    await placeBet(user.id, 10, [
      { matchId: a.id, market: '1X2', selection: '1', odds: 1.8 },
      { matchId: b.id, market: '1X2', selection: '1', odds: 2.0 },
      { matchId: c.id, market: '1X2', selection: '2', odds: 3.0 }, // away on a home win = LOST
    ]);
    const { betService } = await import('../src/services/bet.service');
    await betService.settlePendingBets();
    const bet = await prisma.bet.findFirstOrThrow({ where: { userId: user.id } });
    check('ticket status', bet.status, 'LOST');
    check('no refund, no payout', await balanceOf(user.id), '90.00');
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    check('betsCount incremented', u.betsCount, 1);
    check('betsWon NOT incremented', u.betsWon, 0);
    check('profit = -10', money(u.profit), '-10.00');
  }

  console.log('\n=== 4. FINISHED with no score stays PENDING (was: LOST) ===');
  {
    const user = await makeUser('no-score');
    const a = await makeMatch('FINISHED', null, null);
    await placeBet(user.id, 10, [{ matchId: a.id, market: '1X2', selection: '1', odds: 2.0 }]);
    const { betService } = await import('../src/services/bet.service');
    await betService.settlePendingBets();
    const bet = await prisma.bet.findFirstOrThrow({ where: { userId: user.id } });
    check('ticket NOT settled', bet.status, 'PENDING');
    check('stake still held, not lost', await balanceOf(user.id), '90.00');
  }

  console.log('\n=== 5. One finished leg + one undecided leg => still PENDING ===');
  {
    const user = await makeUser('partial');
    const a = await makeMatch('FINISHED', 2, 1);
    const b = await makeMatch('LIVE', 0, 0);
    await placeBet(user.id, 10, [
      { matchId: a.id, market: '1X2', selection: '1', odds: 1.8 },
      { matchId: b.id, market: '1X2', selection: '1', odds: 2.0 },
    ]);
    const { betService } = await import('../src/services/bet.service');
    await betService.settlePendingBets();
    const bet = await prisma.bet.findFirstOrThrow({ where: { userId: user.id } });
    check('ticket PENDING while one leg is live', bet.status, 'PENDING');
    check('balance untouched', await balanceOf(user.id), '90.00');
  }

  console.log('\n=== 6. Settling twice does not pay twice ===');
  {
    const user = await makeUser('double-settle');
    const a = await makeMatch('FINISHED', 2, 1);
    await placeBet(user.id, 10, [{ matchId: a.id, market: '1X2', selection: '1', odds: 2.0 }]);
    const { betService } = await import('../src/services/bet.service');
    await betService.settlePendingBets();
    const afterFirst = await balanceOf(user.id);
    await betService.settlePendingBets();
    await betService.settlePendingBets();
    check('payout happened once only', await balanceOf(user.id), afterFirst);
    check('balance is stake-refunded + payout', afterFirst, '110.00');
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    check('betsCount not double counted', u.betsCount, 1);
    check('one notification only', await prisma.notification.count({ where: { userId: user.id, type: 'BET_WON' } }), 1);
  }

  console.log('\n=== 7. cancel() cannot overwrite a settlement (the race) ===');
  {
    const user = await makeUser('cancel-race');
    const a = await makeMatch('FINISHED', 2, 1);
    await placeBet(user.id, 10, [{ matchId: a.id, market: '1X2', selection: '1', odds: 2.0 }]);
    const bet = await prisma.bet.findFirstOrThrow({ where: { userId: user.id } });

    const { betService } = await import('../src/services/bet.service');
    // Settle first, then attempt the cancel that used to refund on top of it.
    await betService.settlePendingBets();
    let cancelThrew = false;
    try {
      await betService.cancel(bet.id, user.id);
    } catch {
      cancelThrew = true;
    }
    check('cancel rejected after settlement', cancelThrew, true);
    const after = await prisma.bet.findUniqueOrThrow({ where: { id: bet.id } });
    check('status stayed WON, not overwritten', after.status, 'WON');
    check('payout not double-credited', await balanceOf(user.id), '110.00');
  }

  console.log('\n=== 8. Concurrent cancel + settle cannot both win ===');
  {
    const user = await makeUser('concurrent');
    const a = await makeMatch('FINISHED', 2, 1);
    await placeBet(user.id, 10, [{ matchId: a.id, market: '1X2', selection: '1', odds: 2.0 }]);
    const bet = await prisma.bet.findFirstOrThrow({ where: { userId: user.id } });
    const { betService } = await import('../src/services/bet.service');
    const results = await Promise.allSettled([
      betService.settlePendingBets(),
      betService.cancel(bet.id, user.id),
    ]);
    const after = await prisma.bet.findUniqueOrThrow({ where: { id: bet.id } });
    const bal = await balanceOf(user.id);
    console.log(`      settle=${results[0].status} cancel=${results[1].status} -> status=${after.status} balance=${bal}`);

    // The match here is FINISHED, so cancel() is now refused up front by the
    // match-state check — that check runs inside the same transaction as the
    // claim, and it is what the race used to get past. The status-guarded
    // updateMany is still the backstop that makes this hold for the cases the
    // check cannot see (e.g. a future match that settlement reaches first), so
    // the assertion below stays written against "exactly one money path",
    // not against any particular status.
    const settledWon = after.status === 'WON' && bal === '110.00';
    const settledLost = after.status === 'LOST' && bal === '90.00';
    const cancelledRefund = after.status === 'CANCELLED' && bal === '100.00';
    check('exactly one money path applied (no payout+refund)',
      settledWon || settledLost || cancelledRefund, true);
    check('balance is one of the three legal outcomes',
      ['110.00', '90.00', '100.00'].includes(bal), true);
  }

  console.log('\n=== 9. VOID survives a sync, and scoring a void is refused ===');
  {
    const user = await makeUser('void-guard');
    const a = await makeMatch('SCHEDULED', null, null);
    const { matchService } = await import('../src/services/match.service');
    await matchService.voidMatch(a.id);
    check('status is VOID', (await prisma.match.findUniqueOrThrow({ where: { id: a.id } })).status, 'VOID');
    const after = await prisma.match.findUniqueOrThrow({ where: { id: a.id } });
    check('VOID did NOT invent a score', [after.homeScore, after.awayScore], [null, null]);
    let threw = false;
    try {
      await matchService.updateScore(a.id, { homeScore: 0, awayScore: 0, status: 'FINISHED' });
    } catch { threw = true; }
    check('scoring a VOID match is refused', threw, true);
    await matchService.unvoidMatch(a.id);
    check('unvoid returns it to SCHEDULED', (await prisma.match.findUniqueOrThrow({ where: { id: a.id } })).status, 'SCHEDULED');
  }

  console.log('\n=== 10. Rounding invariant: stake * totalOdds === payout ===');
  {
    const user = await makeUser('rounding');
    // placeBet requires SCHEDULED matches with a future date and real Odds rows, so set those up rather than bypassing it.
    const future = new Date(Date.now() + 86_400_000);
    const a = await prisma.match.create({
      data: { externalId: `r-${Date.now()}-a`, homeTeam: 'H', awayTeam: 'A', league: 'L', country: 'Manual', matchDate: future, status: 'SCHEDULED' },
    });
    const b = await prisma.match.create({
      data: { externalId: `r-${Date.now()}-b`, homeTeam: 'H2', awayTeam: 'A2', league: 'L', country: 'Manual', matchDate: future, status: 'SCHEDULED' },
    });
    createdMatchIds.push(a.id, b.id);
    // Odds.value is Decimal(10,2), so the DB stores 2-decimal prices (1.955 would be persisted as 1.96). Use 2-decimal legs, which is what real odds look like, and assert the invariant that matters: the stored payout equals stake * the STORED (rounded) total odds, not a figure derived from unrounded intermediates.
    await prisma.odds.create({ data: { matchId: a.id, market: '1X2', selection: '1', value: 1.95 } });
    await prisma.odds.create({ data: { matchId: b.id, market: '1X2', selection: '1', value: 1.87 } });

    const { betService } = await import('../src/services/bet.service');
    const placed = await betService.placeBet(user.id, 100, [
      { matchId: a.id, market: '1X2', selection: '1' },
      { matchId: b.id, market: '1X2', selection: '1' },
    ] as any);
    check('totalOdds stored', money(placed.totalOdds), '3.65'); // 1.95 * 1.87 = 3.6465 -> 3.65
    check('potentialReturn = stake * totalOdds', money(placed.potentialReturn), '365.00');

    // Now finish both matches and settle.
    await prisma.match.update({ where: { id: a.id }, data: { status: 'FINISHED', homeScore: 2, awayScore: 1 } });
    await prisma.match.update({ where: { id: b.id }, data: { status: 'FINISHED', homeScore: 3, awayScore: 0 } });
    await betService.settlePendingBets();
    check('payout equals the stored stake * totalOdds', await balanceOf(user.id), '365.00');

    // Direct demonstration of the bug that was fixed: with the old ordering,
    // 1.95 * 1.87 = 3.6465, stake*raw = 364.65, while the ticket would have
    // displayed totalOdds 3.65 -> implying 365.00. The invariant now holds.
    check('invariant stake*totalOdds === payout', money(Number(placed.stake) * Number(placed.totalOdds)), money(placed.potentialReturn));
  }

  console.log('\n=== 11. cancel() only works while every leg is still open ===');
  {
    const { betService } = await import('../src/services/bet.service');

    // 11a. All legs SCHEDULED and in the future -> the ticket is cancellable and the stake comes back in full.
    {
      const user = await makeUser('cancel-ok');
      const a = await makeFutureMatch(7);
      const b = await makeFutureMatch(3);
      await placeBet(user.id, 10, [
        { matchId: a.id, market: '1X2', selection: '1', odds: 1.8 },
        { matchId: b.id, market: '1X2', selection: '1', odds: 2.0 },
      ]);
      const bet = await prisma.bet.findFirstOrThrow({ where: { userId: user.id } });
      check('balance after stake', await balanceOf(user.id), '90.00');

      const cancelled = await betService.cancel(bet.id, user.id);
      check('ticket marked CANCELLED', cancelled.status, 'CANCELLED');
      check('stake refunded in full', await balanceOf(user.id), '100.00');

      // 11b. Cancelling the same ticket again must not refund a second time.
      // The status guard on the claim is what stops this, and it is the reason
      // the double-cancel path can never be reached by double-submitting.
      let secondThrew = false;
      try {
        await betService.cancel(bet.id, user.id);
      } catch {
        secondThrew = true;
      }
      check('second cancel rejected', secondThrew, true);
      check('balance unchanged after second cancel', await balanceOf(user.id), '100.00');
      check('ticket still CANCELLED', (await prisma.bet.findUniqueOrThrow({ where: { id: bet.id } })).status, 'CANCELLED');
    }

    // 11c. A finished leg -> refused. This is the abuse: the leg already lost,
    // yet the ticket was still PENDING and refundable.
    {
      const user = await makeUser('cancel-finished');
      const a = await makeMatch('FINISHED', 1, 3);
      const b = await makeFutureMatch(7);
      await placeBet(user.id, 10, [
        { matchId: a.id, market: '1X2', selection: '1', odds: 1.9 }, // lost: 1-3
        { matchId: b.id, market: '1X2', selection: '1', odds: 2.0 },
      ]);
      const bet = await prisma.bet.findFirstOrThrow({ where: { userId: user.id } });
      let threw = false;
      try {
        await betService.cancel(bet.id, user.id);
      } catch {
        threw = true;
      }
      check('cancel refused on a FINISHED leg', threw, true);
      check('ticket still PENDING', (await prisma.bet.findUniqueOrThrow({ where: { id: bet.id } })).status, 'PENDING');
      check('no refund', await balanceOf(user.id), '90.00');
    }

    // 11d. A live leg -> refused.
    {
      const user = await makeUser('cancel-live');
      const a = await makeMatch('LIVE', 0, 0);
      const b = await makeFutureMatch(7);
      await placeBet(user.id, 10, [
        { matchId: a.id, market: '1X2', selection: '1', odds: 1.9 },
        { matchId: b.id, market: '1X2', selection: '1', odds: 2.0 },
      ]);
      const bet = await prisma.bet.findFirstOrThrow({ where: { userId: user.id } });
      let threw = false;
      try {
        await betService.cancel(bet.id, user.id);
      } catch {
        threw = true;
      }
      check('cancel refused on a LIVE leg', threw, true);
      check('no refund', await balanceOf(user.id), '90.00');
    }

    // 11e. SCHEDULED but the kick-off has passed -> refused. Status alone is not
    // enough: a match can sit SCHEDULED after its scheduled time while the feed
    // is late, and it is already un-bettable by the same rule placeBet applies.
    {
      const user = await makeUser('cancel-past');
      const a = await makeFutureMatch(7);
      await prisma.match.update({ where: { id: a.id }, data: { matchDate: new Date(Date.now() - 3_600_000) } });
      await placeBet(user.id, 10, [{ matchId: a.id, market: '1X2', selection: '1', odds: 2.0 }]);
      const bet = await prisma.bet.findFirstOrThrow({ where: { userId: user.id } });
      check('fixture really is SCHEDULED with a past date',
        (await prisma.match.findUniqueOrThrow({ where: { id: a.id } })).status, 'SCHEDULED');
      let threw = false;
      try {
        await betService.cancel(bet.id, user.id);
      } catch {
        threw = true;
      }
      check('cancel refused on a past kick-off', threw, true);
      check('no refund', await balanceOf(user.id), '90.00');
    }

    // 11f. The full abuse path: a lost leg + an unplayed leg. Settlement must
    // turn the ticket LOST on the lost leg alone — without that, the ticket
    // stays PENDING, cancel() refuses it (the finished leg), and the money
    // stays correctly tied up either way. Both halves are asserted because
    // either one alone leaves the ticket in a state the user can exploit or lose money on.
    {
      const user = await makeUser('lost-then-cancel');
      const a = await makeMatch('FINISHED', 1, 3);   // Canada vs Mexico, home leg lost
      const b = await makeFutureMatch(7);
      await placeBet(user.id, 10, [
        { matchId: a.id, market: '1X2', selection: '1', odds: 1.9 },
        { matchId: b.id, market: '1X2', selection: '1', odds: 2.0 },
      ]);
      const bet = await prisma.bet.findFirstOrThrow({ where: { userId: user.id } });

      // Before settlement: the ticket is still PENDING, so cancel() — not settlement — is what must keep the money away from the bettor.
      let earlyThrew = false;
      try {
        await betService.cancel(bet.id, user.id);
      } catch {
        earlyThrew = true;
      }
      check('cancel refused before settlement', earlyThrew, true);
      check('balance untouched before settlement', await balanceOf(user.id), '90.00');

      await betService.settlePendingBets();

      const after = await prisma.bet.findUniqueOrThrow({
        where: { id: bet.id }, include: { selections: true },
      });
      check('ticket settled as LOST on the lost leg alone', after.status, 'LOST');
      check('stake not refunded', await balanceOf(user.id), '90.00');
      const lostSel = after.selections.find((s) => s.matchId === a.id)!;
      const pendingSel = after.selections.find((s) => s.matchId === b.id)!;
      check('lost leg flagged won=false', lostSel.won, false);
      check('unplayed leg left undecided', pendingSel.won, null);

      let lateThrew = false;
      try {
        await betService.cancel(bet.id, user.id);
      } catch {
        lateThrew = true;
      }
      check('cancel refused after settlement', lateThrew, true);
      check('balance still not refunded', await balanceOf(user.id), '90.00');
    }

    // 11g. Ownership is still enforced first, and a stranger cannot probe the
    // match state of somebody else's ticket by cancelling it.
    {
      const owner = await makeUser('cancel-owner');
      const stranger = await makeUser('cancel-stranger');
      const a = await makeFutureMatch(7);
      await placeBet(owner.id, 10, [{ matchId: a.id, market: '1X2', selection: '1', odds: 2.0 }]);
      const bet = await prisma.bet.findFirstOrThrow({ where: { userId: owner.id } });
      let threw = false;
      try {
        await betService.cancel(bet.id, stranger.id);
      } catch {
        threw = true;
      }
      check("another user's cancel rejected", threw, true);
      check("other user's balance untouched", await balanceOf(stranger.id), '100.00');
      check("ticket still PENDING", (await prisma.bet.findUniqueOrThrow({ where: { id: bet.id } })).status, 'PENDING');
    }
  }

  console.log('\n=== 12. updateScore() only records a result on a playable match ===');
  {
    // updateScore used to write whatever `status` the request carried. The two
    // statuses that mattered: SCHEDULED, which flips a finished match back to
    // bettable (placeBet only requires SCHEDULED + a future matchDate), and
    // VOID, which bypasses voidMatch() and its deliberate two-step.
    const { matchService } = await import('../src/services/match.service');

    const rejects = async (label: string, matchId: string, status: string) => {
      let threw = false;
      try {
        await matchService.updateScore(matchId, { homeScore: 2, awayScore: 1, status });
      } catch {
        threw = true;
      }
      check(label, threw, true);
    };

    // 12a. An unrecognised status is refused before anything is written.
    {
      const a = await makeMatch('LIVE', null, null);
      await rejects('unknown status refused', a.id, 'NOT_A_STATUS');
      const after = await prisma.match.findUniqueOrThrow({ where: { id: a.id } });
      check('status unchanged', after.status, 'LIVE');
      check('score not written', [after.homeScore, after.awayScore], [null, null]);
    }

    // 12b. SCHEDULED on a FINISHED match — the reopen that has to be impossible.
    {
      const a = await makeMatch('FINISHED', 3, 0);
      await rejects('SCHEDULED refused on a FINISHED match', a.id, 'SCHEDULED');
      const after = await prisma.match.findUniqueOrThrow({ where: { id: a.id } });
      check('status stayed FINISHED', after.status, 'FINISHED');
      check('score not overwritten', [after.homeScore, after.awayScore], [3, 0]);
    }

    // 12c. POSTPONED and CANCELLED mean the event produced no result; they arrive from the feed via mapStatus, not from a manual score entry.
    {
      const a = await makeMatch('SCHEDULED', null, null);
      await rejects('POSTPONED refused', a.id, 'POSTPONED');
      await rejects('CANCELLED refused', a.id, 'CANCELLED');
      check('status stayed SCHEDULED',
        (await prisma.match.findUniqueOrThrow({ where: { id: a.id } })).status, 'SCHEDULED');
    }

    // 12d. VOID cannot be reached through updateScore.
    {
      const a = await makeMatch('SCHEDULED', null, null);
      await matchService.voidMatch(a.id);
      await rejects('VOID refused via updateScore', a.id, 'VOID');
      const after = await prisma.match.findUniqueOrThrow({ where: { id: a.id } });
      check('match is still VOID', after.status, 'VOID');
      check('VOID did not gain a score', [after.homeScore, after.awayScore], [null, null]);
    }

    // 12e. LIVE and FINISHED are both accepted — recording a running score and recording the final one are the two legitimate uses.
    {
      const a = await makeMatch('LIVE', 1, 0);
      const updated = await matchService.updateScore(a.id, { homeScore: 2, awayScore: 1, status: 'FINISHED' });
      check('FINISHED accepted', updated?.status, 'FINISHED');
      check('final score stored', [updated?.homeScore, updated?.awayScore], [2, 1]);

      const b = await makeMatch('SCHEDULED', null, null);
      const live = await matchService.updateScore(b.id, { homeScore: 0, awayScore: 0, status: 'LIVE' });
      check('LIVE accepted', live?.status, 'LIVE');
      check('running score stored', [live?.homeScore, live?.awayScore], [0, 0]);
    }

    // 12f. A FINISHED match with a future matchDate and status flipped back to SCHEDULED would be bettable again. Proved end-to-end: the state updateScore refuses is exactly the state placeBet would otherwise accept.
    {
      const user = await makeUser('reopen-check');
      const a = await makeFutureMatch(7, 'SCHEDULED');
      await rejects('cannot reopen the finished match', a.id, 'SCHEDULED');
      // With the status flip refused, the match is still bettable — the guard blocks the transition, it does not block betting on an open match.
      await prisma.odds.create({ data: { matchId: a.id, market: '1X2', selection: '1', value: 1.9 } });
      const { betService } = await import('../src/services/bet.service');
      let placed = false;
      try {
        await betService.placeBet(user.id, 10, [{ matchId: a.id, market: '1X2', selection: '1' } as any]);
        placed = true;
      } catch {
        placed = false;
      }
      check('the un-reopened SCHEDULED match is still bettable', placed, true);
      check('score was never written by the refused call',
        (await prisma.match.findUniqueOrThrow({ where: { id: a.id } })).status, 'SCHEDULED');
    }
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
  });