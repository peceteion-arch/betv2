import { prisma } from '../lib/prisma';
import { notificationService } from './notification.service';
import { userService } from './user.service';
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

    const totalOdds = lockedSelections.reduce((acc, s) => acc * s.odds, 1);
    const potentialReturn = stake * totalOdds;

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
          totalOdds: Math.round(totalOdds * 100) / 100,
          potentialReturn: Math.round(potentialReturn * 100) / 100,
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
      const bet = await tx.bet.findUnique({ where: { id: betId } });
      if (!bet) throw new Error('Bet not found');
      if (bet.userId !== userId) throw new Error('Not your bet');
      if (bet.status !== 'PENDING') throw new Error('Can only cancel pending bets');

      await tx.user.update({
        where: { id: userId },
        data: { balance: { increment: bet.stake } },
      });

      return tx.bet.update({
        where: { id: betId },
        data: { status: 'CANCELLED' },
      });
    });

    return mapBet(result);
  },
  async settlePendingBets() {
    await prisma.$transaction(async (tx) => {
      const pendingBets = await tx.bet.findMany({
        where: { status: 'PENDING' },
        include: {
          selections: { include: { match: true } },
          user: true,
        },
      });

      for (const bet of pendingBets) {
        let anyLost = false;
        let anyVoid = false;
        let allFinished = true;

        for (const selection of bet.selections) {
          const match = selection.match;

          if (match.status === 'POSTPONED' || match.status === 'CANCELLED') {
            anyVoid = true;
            await tx.betSelection.update({
              where: { id: selection.id },
              data: { won: null },
            });
            continue;
          }

          if (match.status !== 'FINISHED') {
            allFinished = false;
            continue;
          }

          const won = this.checkSelectionWon(selection.market, selection.selection, match);

          if (won === null) {
            anyVoid = true;
            await tx.betSelection.update({
              where: { id: selection.id },
              data: { won: null },
            });
            continue;
          }

          await tx.betSelection.update({
            where: { id: selection.id },
            data: { won },
          });

          if (!won) {
            anyLost = true;
          }
        }

        if (anyLost) {
          const lost = await tx.bet.updateMany({
            where: { id: bet.id, status: 'PENDING' },
            data: { status: 'LOST', settledAt: new Date() },
          });
          if (lost.count !== 1) continue;

          await userService.updateStats(bet.userId, false, -Number(bet.stake), Number(bet.stake), tx);
          await notificationService.create(bet.userId, 'BET_LOST', `Perdeste ${Number(bet.stake).toFixed(2)} créditos - multipla perdida`, tx);
          continue;
        }

        if (!allFinished) continue;

        if (anyVoid) {
          const cancelled = await tx.bet.updateMany({
            where: { id: bet.id, status: 'PENDING' },
            data: { status: 'CANCELLED', settledAt: new Date() },
          });
          if (cancelled.count !== 1) continue;

          await tx.user.update({
            where: { id: bet.userId },
            data: { balance: { increment: bet.stake } },
          });
          await notificationService.create(bet.userId, 'BET_CANCELLED', `Aposta anulada - push/void. ${Number(bet.stake).toFixed(2)} créditos devolvidos`, tx);
          continue;
        }

        const profit = Number(bet.potentialReturn) - Number(bet.stake);
        const won = await tx.bet.updateMany({
          where: { id: bet.id, status: 'PENDING' },
          data: { status: 'WON', settledAt: new Date() },
        });
        if (won.count !== 1) continue;

        await tx.user.update({
          where: { id: bet.userId },
          data: { balance: { increment: bet.potentialReturn } },
        });
        await userService.updateStats(bet.userId, true, profit, Number(bet.stake), tx);
        await notificationService.create(bet.userId, 'BET_WON', `Ganhaste ${Number(bet.potentialReturn).toFixed(2)} créditos!`, tx);
      }
    });
  },

  checkSelectionWon(market: string, selection: string, match: {
    homeScore: number | null;
    awayScore: number | null;
    halfTimeHome: number | null;
    halfTimeAway: number | null;
  }): boolean | null {
    if (match.homeScore === null || match.homeScore === undefined) return false;
    if (match.awayScore === null || match.awayScore === undefined) return false;

    const home = match.homeScore;
    const away = match.awayScore;
    const total = home + away;
    const htHome = match.halfTimeHome;
    const htAway = match.halfTimeAway;

    switch (market) {
      case '1X2':
        if (selection === '1') return home > away;
        if (selection === 'X') return home === away;
        if (selection === '2') return away > home;
        return false;

      case 'DUPLA_HIPOTESE':
        if (selection === '1X') return home >= away;
        if (selection === 'X2') return away >= home;
        if (selection === '12') return home !== away;
        return false;

      case 'MARCAS_0_5':
        return selection === 'Mais 0.5' ? total > 0.5 : total < 0.5;
      case 'MARCAS_1_5':
        return selection === 'Mais 1.5' ? total > 1.5 : total < 1.5;
      case 'MARCAS_2_5':
        return selection === 'Mais 2.5' ? total > 2.5 : total < 2.5;
      case 'MARCAS_3_5':
        return selection === 'Mais 3.5' ? total > 3.5 : total < 3.5;
      case 'MARCAS_4_5':
        return selection === 'Mais 4.5' ? total > 4.5 : total < 4.5;

      case 'AMBAS_MARCAM':
        if (selection === 'Sim') return home > 0 && away > 0;
        if (selection === 'Não') return home === 0 || away === 0;
        return false;

      case 'RESULTADO_CORRETO': {
        const score = `${home}-${away}`;
        return selection === score;
      }

      case 'RESULTADO_INTERVALO':
        // No feed populates halfTime scores, so this market can never be
        // settled fairly — void it rather than force a loss.
        if (htHome === null || htHome === undefined) return null;
        if (htAway === null || htAway === undefined) return null;
        if (selection === '1') return htHome > htAway;
        if (selection === 'X') return htHome === htAway;
        if (selection === '2') return htAway > htHome;
        return false;

      case 'HANDICAP_n1_5':
        if (selection.includes('Casa')) return (home - 1.5) > away;
        return (away - 1.5) > home;
      case 'HANDICAP_n0_5':
        if (selection.includes('Casa')) return (home - 0.5) > away;
        return (away - 0.5) > home;
      case 'HANDICAP_0_0':
        return null;
      case 'HANDICAP_0_5':
        if (selection.includes('Casa')) return (home + 0.5) > away;
        return (away + 0.5) > home;
      case 'HANDICAP_1_5':
        if (selection.includes('Casa')) return (home + 1.5) > away;
        return (away + 1.5) > home;

      case 'IMPAR_PAR':
        return selection === 'Ímpar' ? total % 2 === 1 : total % 2 === 0;

      case 'GOLOS_0':
      case 'GOLOS_1':
      case 'GOLOS_2':
      case 'GOLOS_3':
      case 'GOLOS_4':
      case 'GOLOS_5':
      case 'GOLOS_6': {
        const expectedTotal = parseInt(market.split('_').pop() || '0');
        return total === expectedTotal;
      }

      default:
        return false;
    }
  },
};
