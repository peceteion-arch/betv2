import { prisma } from '../lib/prisma';
import { env, SCOREABLE_MATCH_STATUSES } from '../config/env';
import { Prisma } from '@prisma/client';

// Odds.value is @db.Decimal, so Prisma hands it back as a Decimal that
// serialises to a JSON string ("1.90"). The UI calls .toFixed() on it, which
// only exists on numbers, so every match read has to be normalised before it
// leaves the API. listAll() in particular feeds the admin table, which reads
// the same field.
const mapOdds = (odds: any[]) =>
  odds.map((o) => ({ ...o, value: Number(o.value) }));

export interface FootballMatch {
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  homeCrest?: string;
  awayCrest?: string;
  league: string;
  country: string;
  matchday?: number;
  groupStage?: string;
  matchDate: Date;
  status: string;
  homeScore?: number;
  awayScore?: number;
}

export const matchService = {

  mapStatus(apiStatus: string): string {
    const statusMap: Record<string, string> = {
      SCHEDULED: 'SCHEDULED',
      TIMED: 'SCHEDULED',
      IN_PLAY: 'LIVE',
      PAUSED: 'LIVE',
      FINISHED: 'FINISHED',
      POSTPONED: 'POSTPONED',
      CANCELLED: 'CANCELLED',
    };
    return statusMap[apiStatus] || 'SCHEDULED';
  },


  async listUpcoming(limit: number = 20, cursor?: string) {
    const now = new Date();
    // Typed with its return type rather than Prisma.MatchFindManyArgs so the
    // `include` survives inference and `odds` is visible on each match.
    const query: Prisma.MatchFindManyArgs & { include: { odds: true } } = {
      where: {
        matchDate: { gte: now },
        status: 'SCHEDULED',
      },
      include: { odds: true },
      orderBy: { matchDate: 'asc' },
      take: limit + 1,
    };

    if (cursor) {
      query.cursor = { id: cursor };
      query.skip = 1;
    }

    const matches = await prisma.match.findMany(query);
    const hasMore = matches.length > limit;
    const items = (hasMore ? matches.slice(0, limit) : matches).map((m) => ({
      ...m,
      odds: mapOdds(m.odds),
    }));

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  },

  async listLive(limit: number = 50) {
    const now = new Date();
    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { status: 'LIVE' },
          { AND: [{ status: 'SCHEDULED' }, { matchDate: { lte: now } }] },
        ],
      },
      include: { odds: true },
      orderBy: { matchDate: 'desc' },
      take: limit,
    });
    return matches.map((m) => ({ ...m, odds: mapOdds(m.odds) }));
  },

  async getById(id: string) {
    const match = await prisma.match.findUnique({
      where: { id },
      include: { odds: true },
    });
    if (!match) throw new Error('Match not found');
    return { ...match, odds: mapOdds(match.odds) };
  },

  // Admin panel listing: every match regardless of status, no pagination.
  async listAll() {
    const matches = await prisma.match.findMany({
      include: { odds: true },
      orderBy: { matchDate: 'desc' },
    });
    return matches.map((m) => ({ ...m, odds: mapOdds(m.odds) }));
  },

  async createManual(data: {
    homeTeam: string;
    awayTeam: string;
    league: string;
    matchDate: string;
  }) {
    // Timestamp suffix keeps externalId unique so the same pairing can be
    // scheduled twice on different dates.
    const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '-');
    const externalId = `manual-${slug(data.homeTeam)}-${slug(data.awayTeam)}-${Date.now()}`;

    const newMatch = await prisma.match.create({
      data: {
        homeTeam: data.homeTeam,
        awayTeam: data.awayTeam,
        league: data.league,
        country: 'Manual',
        matchDate: new Date(data.matchDate),
        status: 'SCHEDULED',
        externalId,
        homeCrest: null,
        awayCrest: null,
      },
    });

    await this.generateOdds(newMatch.id);

    const created = await prisma.match.findUnique({
      where: { id: newMatch.id },
      include: { odds: true },
    });
    return created && { ...created, odds: mapOdds(created.odds) };
  },

  async updateScore(id: string, data: { homeScore: number; awayScore: number; status: string }) {
    // The zod schema already restricts status to LIVE/FINISHED, but this is the
    // layer that actually writes the column, so it re-checks. Two reasons it
    // must not accept anything else: SCHEDULED re-opens a finished match for
    // betting (placeBet only requires SCHEDULED + a future matchDate), and VOID
    // bypasses voidMatch(), which is the deliberate two-step for voiding.
    if (!SCOREABLE_MATCH_STATUSES.includes(data.status as (typeof SCOREABLE_MATCH_STATUSES)[number])) {
      throw new Error('Estado inválido para atualizar resultado');
    }

    const existing = await prisma.match.findUnique({ where: { id }, select: { status: true } });
    if (!existing) throw new Error('Jogo não encontrado');
    // Scoring a voided match would silently re-admit it to accumulators. The
    // operator has to explicitly lift the void first.
    if (existing.status === 'VOID') throw new Error('Jogo marcado como VOID - anula o VOID antes de atualizar o resultado');

    await prisma.match.update({
      where: { id },
      data: { homeScore: data.homeScore, awayScore: data.awayScore, status: data.status },
    });

    const updated = await prisma.match.findUnique({
      where: { id },
      include: { odds: true },
    });
    return updated && { ...updated, odds: mapOdds(updated.odds) };
  },

  // Admin marks an event as void. This is NOT a 0-0 result and NOT a
  // FINISHED match: the event produced no playable outcome, so its selections
  // drop out of any accumulator at odds 1.00. Scores are deliberately left
  // untouched so a void never fabricates a result.
  async voidMatch(id: string) {
    const match = await prisma.match.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!match) throw new Error('Jogo não encontrado');
    if (match.status === 'VOID') throw new Error('Jogo já está marcado como VOID');

    const updated = await prisma.match.update({
      where: { id },
      data: { status: 'VOID' },
      include: { odds: true },
    });
    return { ...updated, odds: mapOdds(updated.odds) };
  },

  // Clears a void so the match can be scored normally again. Without this an
  // accidental void would permanently strip the event from every ticket.
  async unvoidMatch(id: string) {
    const match = await prisma.match.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!match) throw new Error('Jogo não encontrado');
    if (match.status !== 'VOID') throw new Error('Jogo não está marcado como VOID');

    const updated = await prisma.match.update({
      where: { id },
      data: { status: 'SCHEDULED' },
      include: { odds: true },
    });
    return { ...updated, odds: mapOdds(updated.odds) };
  },

  // Refuses to delete a match that already has bets on it, so settled history
  // can never be orphaned. Returns the bet count so the route can report 409.
  async deleteMatch(id: string) {
    const bets = await prisma.betSelection.count({ where: { matchId: id } });
    if (bets > 0) return { deleted: false as const, bets };

    await prisma.match.delete({ where: { id } });
    return { deleted: true as const, bets: 0 };
  },

  async generateOdds(matchId: string) {
    const existingOdds = await prisma.odds.findMany({ where: { matchId } });
    if (existingOdds.length > 0) return;

    const jitter = () => Math.round((0.97 + Math.random() * 0.06) * 100) / 100;

    const markets = [
      { market: '1X2', selections: ['1', 'X', '2'] },
      { market: 'DUPLA_HIPOTESE', selections: ['1X', 'X2', '12'] },
      { market: 'MARCAS_0_5', selections: ['Mais 0.5', 'Menos 0.5'] },
      { market: 'MARCAS_1_5', selections: ['Mais 1.5', 'Menos 1.5'] },
      { market: 'MARCAS_2_5', selections: ['Mais 2.5', 'Menos 2.5'] },
      { market: 'MARCAS_3_5', selections: ['Mais 3.5', 'Menos 3.5'] },
      { market: 'MARCAS_4_5', selections: ['Mais 4.5', 'Menos 4.5'] },
      { market: 'AMBAS_MARCAM', selections: ['Sim', 'Não'] },
      { market: 'RESULTADO_CORRETO', selections: ['1-0', '2-0', '2-1', '0-0', '1-1', '2-2', '0-1', '0-2', '1-2'] },
      { market: 'IMPAR_PAR', selections: ['Ímpar', 'Par'] },
    ];

    const baseOdds: Record<string, number[]> = {
      '1X2': [1.90, 3.50, 3.80],
      'DUPLA_HIPOTESE': [1.30, 1.80, 1.25],
      'MARCAS_0_5': [1.08, 9.50],
      'MARCAS_1_5': [1.35, 3.20],
      'MARCAS_2_5': [1.85, 1.95],
      'MARCAS_3_5': [2.60, 1.50],
      'MARCAS_4_5': [3.40, 1.30],
      'AMBAS_MARCAM': [1.75, 2.05],
      'RESULTADO_CORRETO': [5.50, 7.00, 8.50, 9.00, 5.80, 12.00, 6.50, 8.00, 9.50],
      'IMPAR_PAR': [1.90, 1.90],
    };

    const oddsToCreate: Array<{ matchId: string; market: string; selection: string; value: number; source: string }> = [];

    for (const market of markets) {
      const base = baseOdds[market.market];
      for (let i = 0; i < market.selections.length; i++) {
        const value = base ? base[i] * jitter() : 2.00 * jitter();
        oddsToCreate.push({
          matchId,
          market: market.market,
          selection: market.selections[i],
          value: Math.round(value * 100) / 100,
          source: 'estimated',
        });
      }
    }

    await prisma.odds.createMany({ data: oddsToCreate });
  },

};
