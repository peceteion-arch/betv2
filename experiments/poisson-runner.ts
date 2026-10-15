// EXPERIMENTAL — READ ONLY — BETLEAGUE_TEST ONLY — PAS 4.2
// NU modifică producția; NU conectează la betleague; NU folosește generateOdds().
// Calculează probabilități Poisson și cote brute (fără marjă) pentru 24 meciuri evaluabile.
import { PrismaClient } from '@prisma/client';
import { calculate1X2 } from '../apps/api/src/odds-engine/features/poisson.utils';
import { calculateMarketProbabilities } from '../apps/api/src/odds-engine/features/poisson-market.engine';

const TEST_DB_URL = process.env.TEST_DB_URL;
if (!TEST_DB_URL) {
  throw new Error('OPREST: TEST_DB_URL nu este setată. Folosește o variabilă temporară de mediu, NU modifica .env');
}
if (!TEST_DB_URL.includes('betleague_test')) {
  throw new Error('OPREST: TEST_DB_URL nu indică betleague_test. URL verificat: ' + TEST_DB_URL.replace(/:[^:]*@/, ':***@'));
}

const prismaTest = new PrismaClient({ datasourceUrl: TEST_DB_URL, log: ['error'] });

function safeRawOdds(prob: number): number | null {
  if (!Number.isFinite(prob) || prob <= 0) return null;
  const cota = 1 / prob;
  return Number.isFinite(cota) ? cota : null;
}

export async function runExperiment() {
  const comp = await prismaTest.competition.findUnique({ where: { name: 'Liga Demo Galați' }, select: { id: true, name: true } });
  if (!comp) throw new Error('Competiție demo lipsă în betleague_test');

  // Confirmare bază — SELECT pe tabelul de meciuri (read-only)
  const baseCheck = await prismaTest.$queryRaw`SELECT current_database() as db`;
  const dbNameStr: string = (baseCheck as any[])[0]?.db || '';
  if (!dbNameStr.includes('test')) {
    throw new Error('OPREST: baza vizată nu conține "test" — ' + dbNameStr);
  }

  const finishedMatches = await prismaTest.match.findMany({
    where: { competitionId: comp.id, status: 'FINISHED' },
    orderBy: { matchDate: 'asc' },
    include: { homeTeam: true, awayTeam: true },
  });

  const results: any[] = [];
  const excludedReasons: Record<string, string[]> = {};

  for (const m of finishedMatches) {
    const history = await prismaTest.match.findMany({
      where: {
        competitionId: comp.id,
        status: 'FINISHED',
        matchDate: { lt: m.matchDate },
        id: { not: m.id },
      },
      select: { homeScore: true, awayScore: true },
    });

    if (history.length < 1) {
      const reason = `nu există istoric anterior (găsit ${history.length}, minim 1)`;
      excludedReasons[m.id] = [reason];
      results.push({
        matchId: m.id,
        date: m.matchDate,
        home: m.homeTeam?.name ?? 'N/A',
        away: m.awayTeam?.name ?? 'N/A',
        realScoreHome: m.homeScore,
        realScoreAway: m.awayScore,
        excluded: true,
        reason,
        lambdaHome: null,
        lambdaAway: null,
        historicalMatchesUsed: history.length,
      });
      continue;
    }

    const avgHomeGoals = history.reduce((sum, h) => sum + (h.homeScore ?? 0), 0) / history.length;
    const avgAwayGoals = history.reduce((sum, h) => sum + (h.awayScore ?? 0), 0) / history.length;

    // Reutilize calculate1X2 din poisson.utils
    const x2res = calculate1X2(avgHomeGoals, avgAwayGoals, 1e-9, 100);

    const p1 = x2res.converged ? x2res.one : null;
    const pX = x2res.converged ? x2res.draw : null;
    const p2 = x2res.converged ? x2res.two : null;

    const rawOdds = {
      oneRaw: safeRawOdds(p1 ?? 0),
      drawRaw: safeRawOdds(pX ?? 0),
      twoRaw: safeRawOdds(p2 ?? 0),
    };

    // Alte piețe — dacă calculateMarketProbabilities le suportă
    let otherMarkets: any = null;
    try {
      const marketRes = calculateMarketProbabilities(avgHomeGoals, avgAwayGoals);
      if (marketRes && marketRes.valid) {
        otherMarkets = {
          over05: marketRes.over05,
          under05: marketRes.under05,
          over15: marketRes.over15,
          under15: marketRes.under15,
          over25: marketRes.over25,
          under25: marketRes.under25,
          bttsYes: marketRes.bttsYes,
          bttsNo: marketRes.bttsNo,
          converged: marketRes.converged,
          excludedProb: marketRes.excludedProb,
        };
      }
    } catch {
      otherMarkets = { error: 'market calc failed', converged: false };
    }

    results.push({
      matchId: m.id,
      date: m.matchDate,
      home: m.homeTeam?.name ?? 'N/A',
      away: m.awayTeam?.name ?? 'N/A',
      realScoreHome: m.homeScore,
      realScoreAway: m.awayScore,
      excluded: false,
      lambdaHome: avgHomeGoals,
      lambdaAway: avgAwayGoals,
      historicalMatchesUsed: history.length,
      probabilities1X2: {
        one: p1,
        draw: pX,
        two: p2,
        sumApprox1: (p1 ?? 0) + (pX ?? 0) + (p2 ?? 0) + (x2res.excludedProb ?? 0),
        converged: x2res.converged,
        excludedProb: x2res.excludedProb,
      },
      rawOdds1X2: rawOdds,
      otherMarkets,
      labelRawOdds: 'cote teoretice brute, fără marjă',
    });
  }

  const evaluable = results.filter(r => !r.excluded);
  const excluded = results.filter(r => r.excluded);

  // Log-loss și Brier score — numai dacă predicțiile sunt făcute înaintea fiecărui meci (out-of-sample)
  // Calculăm pe predicții 1X2 pentru meciurile evaluabile
  let logLoss1X2 = null;
  let brier1X2 = null;
  let validPredictions = 0;

  const validPredictionsList = evaluable.filter(r => {
    if (!r.probabilities1X2 || !r.probabilities1X2.converged) return false;
    const p1 = r.probabilities1X2.one;
    const pX = r.probabilities1X2.draw;
    const p2 = r.probabilities1X2.two;
    return Number.isFinite(p1) && Number.isFinite(pX) && Number.isFinite(p2)
      && p1 >= 0 && pX >= 0 && p2 >= 0
      && (p1 + pX + p2) <= 1.001; // aproximativ 1, cu toleranță
  });

  validPredictions = validPredictionsList.length;

  if (validPredictions > 0) {
    let logLossSum = 0;
    let brierSum = 0;
    for (const r of validPredictionsList) {
      const p1 = r.probabilities1X2.one ?? 0;
      const pX = r.probabilities1X2.draw ?? 0;
      const p2 = r.probabilities1X2.two ?? 0;
      const realHome = r.realScoreHome ?? 0;
      const realAway = r.realScoreAway ?? 0;
      // Determinăm rezultatul real pentru 1X2
      let outcomeProb = 0;
      if (realHome > realAway) outcomeProb = p1;
      else if (realHome === realAway) outcomeProb = pX;
      else outcomeProb = p2;
      // Tratează probabilități zero pentru log-loss
      const safeProb = outcomeProb <= 0 ? 1e-15 : (outcomeProb > 1 ? 1 - 1e-15 : outcomeProb);
      logLossSum += -Math.log(safeProb);
      // Brier pentru 1X2 (multi-classe aproximat prin suma pătratelor diferențelor)
      const y1 = realHome > realAway ? 1 : 0;
      const yX = realHome === realAway ? 1 : 0;
      const y2 = realHome < realAway ? 1 : 0;
      brierSum += (y1 - p1)**2 + (yX - pX)**2 + (y2 - p2)**2;
    }
    logLoss1X2 = logLossSum / validPredictions;
    brier1X2 = brierSum / (validPredictions * 3);
  }

  return {
    dbVerified: 'betleague_test',
    databaseUrlContainsTest: TEST_DB_URL.includes('betleague_test'),
    databaseUrlUsed: TEST_DB_URL.replace(/:[^:]*@/, ':***@'),
    baseQueryResult: dbNameStr,
    competition: comp.name,
    finishedMatchesFound: finishedMatches.length,
    evaluableCount: evaluable.length,
    excludedCount: excluded.length,
    excludedReasonsMap: excludedReasons,
    excludedList: excluded.map(r => ({ matchId: r.matchId, reason: r.reason })),
    results,
    predictionsSummary: {
      validPredictions,
      logLoss1X2,
      brier1X2,
      note: 'Predicții out-of-sample (istoric < data meciului evaluat). Numărul de meciuri este mic; concluziile sunt indicative, nu definitive.',
    },
    readOnlyConfirmed: true,
    writeOperationsPerformed: 0,
    labelOdds: 'cote teoretice brute, fără marjă — NU adăuga marjă comercială',
  };
}
