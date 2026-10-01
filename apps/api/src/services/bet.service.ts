import { prisma } from '../lib/prisma';
import { notificationService } from './notification.service';
import { userService } from './user.service';
import { evaluateBet, describeVoids } from '../lib/settlement';
import { Prisma } from '@prisma/client';

// stake/totalOdds/potentialReturn and BetSelection.odds are @db.Decimal, so
// they serialise to JSON strings and the UI's .toFixed() crashes. Same
// normalisation the user/admin services already apply to balance and profit.
const mapBet = (bet: any) => ({
  ...bet,
  stake: Number(bet.stake),
  totalOdds: Number(bet.totalOdds),
  potentialReturn: Number(bet.potentialReturn),
  ...(bet.selections && {
    selections: bet.selections.map((s: any) => ({ ...s, odds: Number(s.odds) })),
  }),
});

const round2 = (n: number) => Math.round(n * 100) / 100;

// A ticket may only be cancelled while every one of its matches is still
// open. Same rule placeBet applies, and it is deliberately NOT left to the
// UI: the button is trivially bypassed, and a ticket whose only losing leg
// has already been played must never be refundable.
export class BetCancelConflictError extends Error {}

export const betService = {
  async placeBet(userId: string, stake: number, selections: Array<{
    matchId: string;
    market: string;
    selection: string;
    odds: number;
  }>) {
    if (selections.length === 0) throw new Error('At least one selection required');
    if (selections.length > 20) throw new Error('Maximum 20 selections per bet');

    const lockedSelections: Array<{ matchId: string; market: string; selection: string; odds: number }> = [];
    for (const s of selections) {
      const match = await prisma.match.findUnique({ where: { id: s.matchId } });
      if (!match) throw new Error(`Match not found: ${s.matchId}`);
      if (match.status !== 'SCHEDULED') throw new Error(`Jogo ${match.homeTeam} vs ${match.awayTeam} não está disponível para apostas`);

      if (new Date(match.matchDate).getTime() <= Date.now()) {
        throw new Error(`Jogo ${match.homeTeam} vs ${match.awayTeam} já começou — apostas encerradas`);
      }

      const dbOdd = await prisma.odds.findFirst({
        where: { matchId: s.matchId, market: s.market, selection: s.selection },
      });
      if (!dbOdd) throw new Error(`Odds not found for ${s.selection} in ${s.market}`);

      lockedSelections.push({
        matchId: s.matchId,
        market: s.market,
        selection: s.selection,
        odds: Number(dbOdd.value),
      });
    }

    const seen = new Set<string>();
    for (const s of lockedSelections) {
      const key = `${s.matchId}-${s.market}`;
      if (seen.has(key)) throw new Error(`Duplicate selection: ${s.market} on match ${s.matchId}`);
      seen.add(key);
    }

    // Round the combined odds BEFORE deriving the payout, so the ticket
    // satisfies stake * totalOdds === potentialReturn at stored precision.
    // The previous order (raw totalOdds -> payout, then round both) left the
    // two fields inconsistent: stake 100 on legs [1.955, 1.871] stored
    // totalOdds 3.66 but potentialReturn 365.78 instead of 366.00.
    const totalOdds = round2(lockedSelections.reduce((acc, s) => acc * s.odds, 1));
    const potentialReturn = round2(stake * totalOdds);

    const bet = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('Utilizador não encontrado');
      if (user.isBlocked) throw new Error('Conta bloqueada');
      if (stake <= 0) throw new Error('Stake deve ser superior a 0');
      if (Number(user.balance) < stake) throw new Error('Saldo insuficiente');

      await tx.user.update({
        where: { id: userId, balance: { gte: stake } },
        data: { balance: { decrement: stake } },
      });

      return tx.bet.create({
        data: {
          userId,
          stake,
          totalOdds,
          potentialReturn,
          selections: {
            create: lockedSelections.map((s) => ({
              matchId: s.matchId,
              market: s.market,
              selection: s.selection,
              odds: s.odds,
            })),
          },
        },
        include: { selections: { include: { match: true } } },
      });
    });

    await notificationService.create(userId, 'BET_CREATED', `Aposta de ${stake} CR colocada @ ${totalOdds.toFixed(2)}`);

    return mapBet(bet);
  },

  async listByUser(userId: string, status?: string, cursor?: string, limit: number = 20) {
    const where: Prisma.BetWhereInput = { userId };
    if (status) where.status = status as string;

    const query: Prisma.BetFindManyArgs = {
      where,
      include: {
        selections: { include: { match: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    };

    if (cursor) {
      query.cursor = { id: cursor };
      query.skip = 1;
    }

    const bets = await prisma.bet.findMany(query);
    const hasMore = bets.length > limit;
    const items = (hasMore ? bets.slice(0, limit) : bets).map(mapBet);

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  },

  async getById(betId: string, userId?: string) {
    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      include: {
        selections: { include: { match: true } },
        user: { select: { id: true, name: true } },
      },
    });
    if (!bet) throw new Error('Bet not found');
    if (userId && bet.userId !== userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user?.role !== 'ADMIN') throw new Error('Not your bet');
    }
    return mapBet(bet);
  },

  async cancel(betId: string, userId: string) {
    const result = await prisma.$transaction(async (tx) => {
      const bet = await tx.bet.findUnique({
        where: { id: betId },
        include: { selections: { include: { match: { select: { status: true, matchDate: true } } } } },
      });
      if (!bet) throw new Error('Bet not found');
      if (bet.userId !== userId) throw new Error('Not your bet');
      if (bet.status !== 'PENDING') throw new Error('Can only cancel pending bets');

      // The ownership/PENDING checks above were the whole of the old guard, so a
      // ticket whose first match had already finished (and whose backing
      // selection had already lost) could still be cancelled, handing the
      // stake back for free. One losing leg is fatal to an accumulator, so the
      // moment any match has started the ticket is out of the bettor's hands.
      // Checked here, inside the same transaction as the claim below, so the
      // match state cannot change between the read and the refund.
      const now = new Date();
      if (bet.selections.some((s) => s.match.status !== 'SCHEDULED' || s.match.matchDate <= now)) {
        throw new BetCancelConflictError('Não é possível anular: um dos jogos já começou ou terminou');
      }

      // Claim the ticket with a status-guarded UPDATE before refunding. The
      // old code did the refund first and then a bare `update({where: {id}})`,
      // so a settlement that committed in between would be overwritten —
      // the user would receive both the payout and the refund. updateMany
      // re-evaluates the WHERE under the row lock, so exactly one of the two
      // racers sees count === 1 and only that one refunds.
      const claimed = await tx.bet.updateMany({
        where: { id: betId, status: 'PENDING' },
        data: { status: 'CANCELLED', settledAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error('Can only cancel pending bets');

      await tx.user.update({
        where: { id: userId },
        data: { balance: { increment: bet.stake } },
      });

      return tx.bet.findUnique({ where: { id: betId } });
    });

    if (!result) throw new Error('Bet not found');
    return mapBet(result);
  },
  // Settles every PENDING ticket, one short transaction per ticket.
  //
  // The previous version opened a single transaction spanning the whole loop.
  // Prisma's interactive transaction times out after 5s by default, so a run
  // that touched more than a few hundred bets rolled back everything and
  // nothing was ever settled. Per-bet transactions keep each unit of work
  // short while preserving the invariant that matters: within one ticket, the
  // status flip, the selection flags, the balance and the stats all commit or
  // none do.
  async settlePendingBets() {
    const pendingBets = await prisma.bet.findMany({
      where: { status: 'PENDING' },
      // Stable order so two concurrent runs touch tickets in the same sequence,
      // which is what keeps them from deadlocking on each other's row locks.
      orderBy: { id: 'asc' },
      select: {
        id: true,
        userId: true,
        stake: true,
        selections: {
          include: {
            match: {
              select: {
                status: true,
                homeScore: true,
                awayScore: true,
                halfTimeHome: true,
                halfTimeAway: true,
              },
            },
          },
        },
      },
    });

    for (const bet of pendingBets) {
      try {
        await this.settleBet(bet);
      } catch (error) {
        // One bad ticket must not stop the run. Its own transaction has
        // already rolled back, so it simply stays PENDING for the next run.
        console.error(`Failed to settle bet ${bet.id}:`, error);
      }
    }

    return pendingBets.length;
  },


  // Settles one ticket inside a single transaction: the selection flags, the
  // status flip, the balance movement and the stats either all commit or none
  // do. The old code spread a single settlement across one transaction holding
  // every ticket at once, which Prisma's 5s interactive-transaction timeout
  // would roll back wholesale; per-ticket transactions stay short while making
  // the ticket itself atomic.
  async settleBet(bet: {
    id: string;
    userId: string;
    stake: Prisma.Decimal;
    selections: Array<{
      id: string;
      market: string;
      selection: string;
      odds: Prisma.Decimal;
      match: { status: string; homeScore: number | null; awayScore: number | null; halfTimeHome: number | null; halfTimeAway: number | null };
    }>;
  }) {
    const stake = Number(bet.stake);

    // A match that has not finished yet, or that finished without its result
    // being recorded, is NOT a void — it is simply not ready. The ticket stays
    // PENDING and is re-evaluated on the next settlement run.
    //
    // "Every leg decided" is no longer the precondition. It used to be, and it
    // was what held a dead ticket open: one lost leg plus two unplayed legs sat
    // PENDING for days, and PENDING is cancellable, so the losing bettor could
    // refund a bet that was already lost. A ticket whose evaluation comes back
    // anything but PENDING is settled now; evaluateBet is the single authority
    // on whether the ticket is decided.
    const evaluation = evaluateBet(
      bet.selections.map((s) => ({
        market: s.market,
        selection: s.selection,
        odds: Number(s.odds),
        match: s.match,
      })),
      stake
    );

    if (evaluation.status === 'PENDING') return;

    await prisma.$transaction(async (tx) => {
      // Claim the ticket BEFORE touching the selection flags. The flags used to
      // be written first, and the losing `return` on a lost race is a COMMIT of
      // everything written so far, not a rollback: a cancel() that had already
      // refunded the ticket would still have left the other side's won=true /
      // won=false flags committed onto a CANCELLED bet. Claiming first means
      // the flags are only ever written by the racer that actually owns the
      // ticket, and count !== 1 exits before writing anything.
      if (evaluation.status === 'LOST') {
        const lost = await tx.bet.updateMany({
          where: { id: bet.id, status: 'PENDING' },
          data: { status: 'LOST', settledAt: new Date() },
        });
        if (lost.count !== 1) return;
      }

      // BetSelection.odds is left untouched: it records the odds the bettor
      // actually took, and that history must survive a later void. The void is
      // expressed with `won = null` plus the recalculated ticket totals below.
      // evaluateBet re-labels but never reorders, so index pairing is correct.
      // Legs that are still UNRESOLVED keep won = null — the ticket is settled,
      // but those legs never produced a result.
      for (let i = 0; i < evaluation.selections.length; i++) {
        const outcome = evaluation.selections[i].outcome;
        await tx.betSelection.update({
          where: { id: bet.selections[i].id },
          data: { won: outcome === 'WON' ? true : outcome === 'LOST' ? false : null },
        });
      }

      if (evaluation.status === 'LOST') {
        await userService.updateStats(bet.userId, false, -stake, stake, tx);
        await notificationService.create(
          bet.userId,
          'BET_LOST',
          `Perdeste ${stake.toFixed(2)} créditos - multipla perdida`,
          tx
        );
        return;
      }

      // WON. A ticket whose legs are all void reaches here with an effective
      // total odds of 1.00, so the payout is exactly the stake. The bettor is
      // made whole by this single increment — no separate refund, and the
      // ticket is never marked CANCELLED (that status is reserved for a
      // bettor-initiated cancellation).
      const profit = round2(evaluation.effectivePotentialReturn - stake);
      const claimed = await tx.bet.updateMany({
        where: { id: bet.id, status: 'PENDING' },
        data: {
          status: 'WON',
          settledAt: new Date(),
          // Store the effective figures so ticket history shows what was paid.
          totalOdds: evaluation.effectiveTotalOdds,
          potentialReturn: evaluation.effectivePotentialReturn,
        },
      });
      if (claimed.count !== 1) return;

      await tx.user.update({
        where: { id: bet.userId },
        data: { balance: { increment: evaluation.effectivePotentialReturn } },
      });
      await userService.updateStats(bet.userId, true, profit, stake, tx);
      await notificationService.create(
        bet.userId,
        'BET_WON',
        `Ganhaste ${evaluation.effectivePotentialReturn.toFixed(2)} créditos!${describeVoids(evaluation.voidCount)}`,
        tx
      );
    });
  },
};
