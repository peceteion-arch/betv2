// End-to-end settlement check against a real PostgreSQL instance.
// Not part of `npm test` — run manually with a DATABASE_URL pointing at a
// throwaway database, because it needs a live DB. Verifies the money movement
// that the pure unit tests cannot: balance increments, atomicity, and the
// cancel/settlement race.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const money = (d: unknown) => Number(d).toFixed(2);

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}

async function makeUser(name: string, balance = 100) {
  return prisma.user.create({
    data: { name, email: `${name}-${Date.now()}-${Math.random()}@t.com`, passwordHash: 'x', balance },
  });
}

async function makeMatch(status: string, home: number | null, away: number | null) {
  return prisma.match.create({
    data: {
      externalId: `t-${Date.now()}-${Math.random()}`,
      homeTeam: 'H', awayTeam: 'A', league: 'L', country: 'Manual',
      matchDate: new Date('2020-01-01'), status, homeScore: home, awayScore: away,
    },
  });
}

// Places a bet directly so the fixture is independent of placeBet's validation.
async function placeBet(userId: string, stake: number, legs: Array<{ matchId: string; market: string; selection: string; odds: number }>) {
  return prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { balance: { decrement: stake } } });
    const totalOdds = Math.round(legs.reduce((a, s) => a * s.odds, 1) * 100) / 100;
    return tx.bet.create({
      data: {
        userId, stake, totalOdds,
        potentialReturn: Math.round(stake * totalOdds * 100) / 100,
        selections: { create: legs },
      },
    });
  });
}

async function balanceOf(id: string) {
  return money((await prisma.user.findUniqueOrThrow({ where: { id } })).balance);
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
    // Exactly one of the two money paths may apply.
    const legal = (after.status === 'WON' && bal === '110.00') || (after.status === 'CANCELLED' && bal === '100.00');
    check('exactly one money path applied (no payout+refund)', legal, true);
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

  console.log('\n=== 10. Rounding invariant: stake * totalOdds ===');
  {
    const user = await makeUser('rounding');
    // placeBet requires SCHEDULED matches with a future date and real Odds
    // rows, so set those up rather than bypassing it.
    const future = new Date(Date.now() + 86_400_000);
    const a = await prisma.match.create({
      data: { externalId: `r-${Date.now()}-a`, homeTeam: 'H', awayTeam: 'A', league: 'L', country: 'Manual', matchDate: future, status: 'SCHEDULED' },
    });
    const b = await prisma.match.create({
      data: { externalId: `r-${Date.now()}-b`, homeTeam: 'H2', awayTeam: 'A2', league: 'L', country: 'Manual', matchDate: future, status: 'SCHEDULED' },
    });
    // Odds.value is Decimal(10,2), so the DB stores 2-decimal prices (1.955
    // would be persisted as 1.96). Use 2-decimal legs, which is what real odds
    // look like, and assert the invariant that matters: the stored payout
    // equals stake * the STORED (rounded) total odds, not a figure derived
    // from unrounded intermediates.
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

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
