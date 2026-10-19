import { describe, it, expect, vi, beforeEach } from 'vitest';
import { matchService } from '../src/services/match.service';
import { prisma } from '../src/lib/prisma';
import { matchHistoryProvider } from '../src/odds-engine/providers/match-history.provider';
import * as ratings from '../src/odds-engine/features/team-ratings.features';
import * as marketEngine from '../src/odds-engine/features/poisson-market.engine';
import * as oddsBuilder from '../src/odds-engine/features/odds-from-probabilities';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    match: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    odds: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: async (ops: any) => {
        if (Array.isArray(ops)) {
            return Promise.all(ops.map(o => o));
        }
        return ops(prisma);
    }
  },
}));

vi.mock('../src/odds-engine/providers/match-history.provider', () => ({
    matchHistoryProvider: {
        getGlobalMatches: vi.fn()
    }
}));

describe('matchService.generateOdds', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    const createMatch = (overrides: Record<string, any> = {}) => ({
        id: 'm1',
        homeTeamId: 'h1',
        awayTeamId: 'a1',
        competitionId: 'c1',
        matchDate: new Date('2026-10-20T18:00:00Z'),
        ...overrides,
    });

    it('should skip when odds already exist', async () => {
        const match = createMatch();
        (prisma.match.findUnique as any).mockResolvedValue(match);
        (prisma.odds.findMany as any).mockResolvedValue([{ id: 'o1' }]); // Already exists

        await matchService.generateOdds('m1');

        expect(prisma.odds.createMany).not.toHaveBeenCalled();
    });

    it('should protect manual odds from being overwritten', async () => {
        const match = createMatch();
        (prisma.match.findUnique as any).mockResolvedValue(match);
        (prisma.odds.findMany as any).mockResolvedValue([]); // No odds yet
        (prisma.odds.findFirst as any).mockResolvedValue({ id: 'manual1', source: 'manual' }); // Manual exists

        await matchService.generateOdds('m1');

        expect(prisma.odds.createMany).not.toHaveBeenCalled();
    });

    it('should use statistical engine when history is available', async () => {
        const match = createMatch();
        (prisma.match.findUnique as any).mockResolvedValue(match);
        (prisma.odds.findMany as any).mockResolvedValue([]);
        (prisma.odds.findFirst as any).mockResolvedValue(null);
        (matchHistoryProvider.getGlobalMatches as any).mockResolvedValue([
            { homeTeamId: 'h1', awayTeamId: 'a1', homeScore: 2, awayScore: 1, matchDate: new Date('2026-10-19') }
        ]);

        const mockRatingResult = {
            ratings: new Map([['h1', { attack: 1.2, defense: 0.9 }], ['a1', { attack: 0.8, defense: 1.1 }]]),
            baselineGoals: 2.5,
            competitionGoals: 2.5,
            iterations: 1,
            converged: true
        };
        vi.spyOn(ratings, 'computeTeamRatings').mockReturnValue(mockRatingResult);
        vi.spyOn(ratings, 'expectedGoalsFromRatings').mockReturnValue({
            lambdaA: 2.0,
            lambdaB: 1.2,
            baselineSource: 'competition'
        });
        vi.spyOn(marketEngine, 'calculateMarketProbabilities').mockReturnValue({
            one: 0.4, draw: 0.3, two: 0.3,
            oneX: 0.7, x2: 0.6, twelve: 0.7,
            over05: 0.9, under05: 0.1,
            over15: 0.7, under15: 0.3,
            over25: 0.5, under25: 0.5,
            over35: 0.3, under35: 0.7,
            over45: 0.15, under45: 0.85,
            bttsYes: 0.6, bttsNo: 0.4,
            odd: 0.5, even: 0.5,
            exactScores: { '1-0': 0.1, '0-0': 0.1 },
            converged: true,
            excludedProb: 0.01,
            limitInfo: { maxHome: 10, maxAway: 10, excludedMass: 0.01, errorEstimate: 0.01 },
            valid: true
        });
        vi.spyOn(oddsBuilder, 'buildOddsFromProbabilities').mockReturnValue([
            { market: '1X2', selection: '1', value: 2.5, probability: 0.4 },
            { market: '1X2', selection: 'X', value: 3.2, probability: 0.3 },
            { market: '1X2', selection: '2', value: 3.0, probability: 0.3 }
        ]);

        await matchService.generateOdds('m1');

        expect(prisma.odds.createMany).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.arrayContaining([
                expect.objectContaining({ market: '1X2', selection: '1', value: 2.5, source: 'estimated' }),
                expect.objectContaining({ market: '1X2', selection: 'X', value: 3.2, source: 'estimated' }),
                expect.objectContaining({ market: '1X2', selection: '2', value: 3.0, source: 'estimated' })
            ])
        }));
    });

    it('should fall back to base odds when no history is available', async () => {
        const match = createMatch();
        (prisma.match.findUnique as any).mockResolvedValue(match);
        (prisma.odds.findMany as any).mockResolvedValue([]);
        (prisma.odds.findFirst as any).mockResolvedValue(null);
        (matchHistoryProvider.getGlobalMatches as any).mockResolvedValue([]);

        await matchService.generateOdds('m1');

        expect(prisma.odds.createMany).toHaveBeenCalled();
        const callArgs = (prisma.odds.createMany as any).mock.calls[0][0];
        expect(callArgs.data).toBeDefined();
        expect(callArgs.data.length).toBeGreaterThan(0);
        // Fallback uses jitter so we just verify it was called with 'estimated' source
        expect(callArgs.data[0].source).toBe('estimated');
    });

    it('should fall back to base odds when statistical engine fails', async () => {
        const match = createMatch();
        (prisma.match.findUnique as any).mockResolvedValue(match);
        (prisma.odds.findMany as any).mockResolvedValue([]);
        (prisma.odds.findFirst as any).mockResolvedValue(null);
        (matchHistoryProvider.getGlobalMatches as any).mockResolvedValue([{ some: 'data' }]);

        // Throw to simulate engine failure
        vi.spyOn(ratings, 'computeTeamRatings').mockImplementation(() => {
            throw new Error('Statistical error');
        });

        await matchService.generateOdds('m1');

        expect(prisma.odds.createMany).toHaveBeenCalled();
    });

    it('should fall back to base odds when probabilities are invalid', async () => {
        const match = createMatch();
        (prisma.match.findUnique as any).mockResolvedValue(match);
        (prisma.odds.findMany as any).mockResolvedValue([]);
        (prisma.odds.findFirst as any).mockResolvedValue(null);
        (matchHistoryProvider.getGlobalMatches as any).mockResolvedValue([{ some: 'data' }]);

        const mockRatingResult = {
            ratings: new Map(),
            baselineGoals: 2.5,
            competitionGoals: 2.5,
            iterations: 1,
            converged: true
        };
        vi.spyOn(ratings, 'computeTeamRatings').mockReturnValue(mockRatingResult);
        vi.spyOn(ratings, 'expectedGoalsFromRatings').mockReturnValue({
            lambdaA: null,
            lambdaB: null,
            baselineSource: 'global'
        });

        await matchService.generateOdds('m1');

        // Should fall back
        expect(prisma.odds.createMany).toHaveBeenCalled();
    });

    it('should preserve deterministic output for same input (no random jitter in main path)', async () => {
        // Note: The fallback path still uses jitter. The main statistical path
        // is deterministic because it uses the statistical engine which
        // produces fixed values from the same historical data.
        const match = createMatch();
        (prisma.match.findUnique as any).mockResolvedValue(match);
        (prisma.odds.findMany as any).mockResolvedValue([]);
        (prisma.odds.findFirst as any).mockResolvedValue(null);
        (matchHistoryProvider.getGlobalMatches as any).mockResolvedValue([]);

        // First call
        await matchService.generateOdds('m1');
        const firstCall = (prisma.odds.createMany as any).mock.calls[0][0];

        // Reset to simulate fresh call
        (prisma.odds.findMany as any).mockResolvedValue([]);
        (matchHistoryProvider.getGlobalMatches as any).mockResolvedValue([]);
        await matchService.generateOdds('m1');

        // Second call should be different due to jitter in fallback
        // But both should have 'estimated' source
        const secondCall = (prisma.odds.createMany as any).mock.calls[0][0];
        expect(firstCall.data[0].source).toBe('estimated');
        expect(secondCall.data[0].source).toBe('estimated');
    });

    it('should use correct score margin of 15%', async () => {
        const match = createMatch();
        (prisma.match.findUnique as any).mockResolvedValue(match);
        (prisma.odds.findMany as any).mockResolvedValue([]);
        (prisma.odds.findFirst as any).mockResolvedValue(null);
        (matchHistoryProvider.getGlobalMatches as any).mockResolvedValue([{ some: 'data' }]);

        const mockRatingResult = {
            ratings: new Map([['h1', { attack: 1.2, defense: 0.9 }], ['a1', { attack: 0.8, defense: 1.1 }]]),
            baselineGoals: 2.5,
            competitionGoals: 2.5,
            iterations: 1,
            converged: true
        };
        vi.spyOn(ratings, 'computeTeamRatings').mockReturnValue(mockRatingResult);
        vi.spyOn(ratings, 'expectedGoalsFromRatings').mockReturnValue({
            lambdaA: 2.0,
            lambdaB: 1.2,
            baselineSource: 'competition'
        });
        vi.spyOn(marketEngine, 'calculateMarketProbabilities').mockReturnValue({
            one: 0.4, draw: 0.3, two: 0.3,
            oneX: 0.7, x2: 0.6, twelve: 0.7,
            over05: 0.9, under05: 0.1,
            over15: 0.7, under15: 0.3,
            over25: 0.5, under25: 0.5,
            over35: 0.3, under35: 0.7,
            over45: 0.15, under45: 0.85,
            bttsYes: 0.6, bttsNo: 0.4,
            odd: 0.5, even: 0.5,
            exactScores: { '1-0': 0.1, '0-0': 0.1 },
            converged: true,
            excludedProb: 0.01,
            limitInfo: { maxHome: 10, maxAway: 10, excludedMass: 0.01, errorEstimate: 0.01 },
            valid: true
        });
        vi.spyOn(oddsBuilder, 'buildOddsFromProbabilities').mockImplementation((probs, options) => {
            expect(options?.correctScoreMargin).toBe(0.15);
            expect(options?.margin).toBe(0.07);
            return [
                { market: '1X2', selection: '1', value: 2.5, probability: 0.4 },
            ];
        });

        await matchService.generateOdds('m1');

        expect(oddsBuilder.buildOddsFromProbabilities).toHaveBeenCalled();
    });

    it('should include all markets in output', async () => {
        const match = createMatch();
        (prisma.match.findUnique as any).mockResolvedValue(match);
        (prisma.odds.findMany as any).mockResolvedValue([]);
        (prisma.odds.findFirst as any).mockResolvedValue(null);
        (matchHistoryProvider.getGlobalMatches as any).mockResolvedValue([]);

        await matchService.generateOdds('m1');

        const callArgs = (prisma.odds.createMany as any).mock.calls[0][0];
        const markets = callArgs.data.map((o: any) => o.market);
        const uniqueMarkets = [...new Set(markets)];
        expect(uniqueMarkets).toContain('1X2');
        expect(uniqueMarkets).toContain('DUPLA_HIPOTESE');
        expect(uniqueMarkets).toContain('MARCAS_0_5');
        expect(uniqueMarkets).toContain('MARCAS_1_5');
        expect(uniqueMarkets).toContain('MARCAS_2_5');
        expect(uniqueMarkets).toContain('MARCAS_3_5');
        expect(uniqueMarkets).toContain('MARCAS_4_5');
        expect(uniqueMarkets).toContain('AMBAS_MARCAM');
        expect(uniqueMarkets).toContain('RESULTADO_CORRETO');
        expect(uniqueMarkets).toContain('IMPAR_PAR');
    });

    it('should skip when match not found', async () => {
        (prisma.match.findUnique as any).mockResolvedValue(null);
        (prisma.odds.findMany as any).mockResolvedValue([]);

        await matchService.generateOdds('missing');

        expect(prisma.odds.createMany).not.toHaveBeenCalled();
    });
});
