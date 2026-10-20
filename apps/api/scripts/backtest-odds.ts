import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { matchHistoryProvider } from '../src/odds-engine/providers/match-history.provider';
import { computeTeamRatings, expectedGoalsFromRatings } from '../src/odds-engine/features/team-ratings.features';
import { calculateMarketProbabilities } from '../src/odds-engine/features/poisson-market.engine';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

// Deterministic random generator for fixed seed bootstrap
function createRandom(seed: number) {
  return function() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

// Metrics
function logLoss(p: number): number {
  return -Math.log(Math.max(p, 1e-15));
}

function brierScore(probs: number[], actualIdx: number): number {
  let sum = 0;
  for (let i = 0; i < probs.length; i++) {
    const y = i === actualIdx ? 1 : 0;
    sum += Math.pow(probs[i] - y, 2);
  }
  return sum / probs.length;
}

function rps(probs: number[], actualIdx: number): number {
  const n = probs.length;
  let sum = 0;
  for (let i = 0; i < n - 1; i++) {
    let cumP = 0;
    let cumY = 0;
    for (let j = 0; j <= i; j++) {
      cumP += probs[j];
      cumY += (j === actualIdx ? 1 : 0);
    }
    sum += Math.pow(cumP - cumY, 2);
  }
  return sum / (n - 1);
}

// Bootstrap
function bootstrap(data: number[], iterations = 2000): { mean: number; low: number; high: number } {
  const random = createRandom(42);
  const means: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < data.length; j++) {
      const idx = Math.floor(random() * data.length);
      sum += data[idx];
    }
    means.push(sum / data.length);
  }
  means.sort((a, b) => a - b);
  return {
    mean: data.reduce((a, b) => a + b, 0) / data.length,
    low: means[Math.floor(iterations * 0.025)],
    high: means[Math.floor(iterations * 0.975)],
  };
}

function bootstrapDiff(a: number[], b: number[], iterations = 2000): { mean: number; low: number; high: number } {
  const random = createRandom(42);
  const diffs: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let sumDiff = 0;
    for (let j = 0; j < a.length; j++) {
      const idx = Math.floor(random() * a.length);
      sumDiff += (a[idx] - b[idx]);
    }
    diffs.push(sumDiff / a.length);
  }
  diffs.sort((a, b) => a - b);
  return {
    mean: (a.reduce((s, v) => s + v, 0) - b.reduce((s, v) => s + v, 0)) / a.length,
    low: diffs[Math.floor(iterations * 0.025)],
    high: diffs[Math.floor(iterations * 0.975)],
  };
}

async function main() {
  const COMPETITION_NAME = "Platinum League 1";
  const matches = await prisma.match.findMany({
    where: {
      competition: { name: COMPETITION_NAME },
      status: "FINISHED",
      isForfeit: false,
      NOT: { homeScore: null, awayScore: null }
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { matchDate: 'asc' }
  });

  console.log(`\n=== BACKTEST WALK-FORWARD: ${COMPETITION_NAME} ===`);
  console.log(`Total meciuri găsite: ${matches.length}`);

  const evaluatedMatches: any[] = [];
  const skippedMatches: any[] = [];

  for (const m of matches) {
    const asOf = new Date(m.matchDate);
    const history = await matchHistoryProvider.getGlobalMatches(asOf);

    // Filter strictly matchDate < asOf
    const pastMatches = history.filter(h => new Date(h.matchDate).getTime() < asOf.getTime());

    // Check if both teams have at least one previous match
    const homeHasHistory = pastMatches.some(h => h.homeTeamId === m.homeTeamId || h.awayTeamId === m.homeTeamId);
    const awayHasHistory = pastMatches.some(h => h.homeTeamId === m.awayTeamId || h.awayTeamId === m.awayTeamId);

    if (!homeHasHistory || !awayHasHistory) {
      skippedMatches.push({ id: m.id, home: m.homeTeam.name, away: m.awayTeam.name, reason: 'Etapa 1 sau lipsă istoric echipă' });
      continue;
    }

    // Model A: Default
    const ratingsA = computeTeamRatings(pastMatches, asOf, { halfLifeMatches: 10, priorMatches: 3, goalDifferenceCap: 5 });
    const xgA = expectedGoalsFromRatings(ratingsA, m.homeTeamId, m.awayTeamId);
    const probsA = calculateMarketProbabilities(xgA.lambdaA!, xgA.lambdaB!);

    // Model B: Equal teams baseline
    // Average goals per team from history
    const avgGoals = ratingsA.baselineGoals || 0;
    const probsB = calculateMarketProbabilities(avgGoals, avgGoals);

    // Model C: Frequency baseline
    const counts = { '1': 0, 'X': 0, '2': 0, total: 0 };
    for (const h of pastMatches) {
      if (h.homeScore! > h.awayScore!) counts['1']++;
      else if (h.homeScore! === h.awayScore!) counts['X']++;
      else counts['2']++;
      counts.total++;
    }
    const probsC = {
      one: counts['1'] / counts.total,
      draw: counts['X'] / counts.total,
      two: counts['2'] / counts.total,
      over25: 0.5, // dummy for now, not strictly required as "frequency baseline" usually means 1X2
      over45: 0.5,
      bttsYes: 0.5
    };

    // Model D: Variations
    const variations = [
      { name: 'HL5', opts: { halfLifeMatches: 5, priorMatches: 3, goalDifferenceCap: 5 } },
      { name: 'HL20', opts: { halfLifeMatches: 20, priorMatches: 3, goalDifferenceCap: 5 } },
      { name: 'HL1000', opts: { halfLifeMatches: 1000, priorMatches: 3, goalDifferenceCap: 5 } },
      { name: 'P1', opts: { halfLifeMatches: 10, priorMatches: 1, goalDifferenceCap: 5 } },
      { name: 'P6', opts: { halfLifeMatches: 10, priorMatches: 6, goalDifferenceCap: 5 } },
      { name: 'C3', opts: { halfLifeMatches: 10, priorMatches: 3, goalDifferenceCap: 3 } },
      { name: 'C8', opts: { halfLifeMatches: 10, priorMatches: 3, goalDifferenceCap: 8 } },
    ];

    const varResults = variations.map(v => {
      const r = computeTeamRatings(pastMatches, asOf, v.opts);
      const xg = expectedGoalsFromRatings(r, m.homeTeamId, m.awayTeamId);
      return { name: v.name, probs: calculateMarketProbabilities(xg.lambdaA!, xg.lambdaB!) };
    });

    // Real outcome
    let outcomeIdx = 0; // 1
    if (m.homeScore! === m.awayScore!) outcomeIdx = 1; // X
    else if (m.homeScore! < m.awayScore!) outcomeIdx = 2; // 2

    const actualTotal = m.homeScore! + m.awayScore!;
    const isO25 = actualTotal > 2.5;
    const isO45 = actualTotal > 4.5;
    const isBTTS = m.homeScore! > 0 && m.awayScore! > 0;

    evaluatedMatches.push({
      id: m.id,
      home: m.homeTeam.name,
      away: m.awayTeam.name,
      date: m.matchDate,
      score: `${m.homeScore}-${m.awayScore}`,
      outcomeIdx,
      isO25,
      isO45,
      isBTTS,
      lambdaA: xgA.lambdaA,
      lambdaB: xgA.lambdaB,
      A: probsA,
      B: probsB,
      C: probsC,
      D: varResults,
      totalGoals: actualTotal
    });
  }

  console.log(`Meciuri evaluate: ${evaluatedMatches.length}`);
  console.log(`Meciuri excluse (etapa 1/lipsă date): ${skippedMatches.length}`);
  if (skippedMatches.length > 0) {
    console.log("Exemple meciuri excluse:");
    skippedMatches.slice(0, 3).forEach(s => console.log(` - ${s.home} vs ${s.away} (${s.reason})`));
  }

  // --- Metrics Calculation ---
  const metricsA = {
    ll1x2: evaluatedMatches.map(e => logLoss(e.outcomeIdx === 0 ? e.A.one : e.outcomeIdx === 1 ? e.A.draw : e.A.two)),
    brier1x2: evaluatedMatches.map(e => brierScore([e.A.one, e.A.draw, e.A.two], e.outcomeIdx)),
    rps1x2: evaluatedMatches.map(e => rps([e.A.one, e.A.draw, e.A.two], e.outcomeIdx)),
    llO25: evaluatedMatches.map(e => logLoss(e.isO25 ? e.A.over25 : e.A.under25)),
    llO45: evaluatedMatches.map(e => logLoss(e.isO45 ? e.A.over45 : e.A.under45)),
    llBTTS: evaluatedMatches.map(e => logLoss(e.isBTTS ? e.A.bttsYes : e.A.bttsNo))
  };

  const metricsB = {
    ll1x2: evaluatedMatches.map(e => logLoss(e.outcomeIdx === 0 ? e.B.one : e.outcomeIdx === 1 ? e.B.draw : e.B.two))
  };

  const metricsC = {
    ll1x2: evaluatedMatches.map(e => logLoss(e.outcomeIdx === 0 ? e.C.one : e.outcomeIdx === 1 ? e.C.draw : e.C.two))
  };

  const stats = {
    A_ll1x2: bootstrap(metricsA.ll1x2),
    A_brier1x2: bootstrap(metricsA.brier1x2),
    A_rps1x2: bootstrap(metricsA.rps1x2),
    A_llO25: bootstrap(metricsA.llO25),
    A_llO45: bootstrap(metricsA.llO45),
    A_llBTTS: bootstrap(metricsA.llBTTS),
    diffAB: bootstrapDiff(metricsA.ll1x2, metricsB.ll1x2),
    diffAC: bootstrapDiff(metricsA.ll1x2, metricsC.ll1x2)
  };

  // Model D stats
  const varStats = evaluatedMatches[0].D.map((_, i: number) => {
    const name = evaluatedMatches[0].D[i].name;
    const lls = evaluatedMatches.map(e => logLoss(e.outcomeIdx === 0 ? e.D[i].probs.one : e.outcomeIdx === 1 ? e.D[i].probs.draw : e.D[i].probs.two));
    return { name, ...bootstrap(lls) };
  });

  // --- Output Tables ---
  console.log("\n=== METRICI PRINCIPALE (Model A) ===");
  console.log("Metrică        | Medie | IC 95%");
  console.log("---------------|-------|-----------------------");
  console.log(`Log Loss 1X2   | ${stats.A_ll1x2.mean.toFixed(4)} | [${stats.A_ll1x2.low.toFixed(4)}, ${stats.A_ll1x2.high.toFixed(4)}]`);
  console.log(`Brier 1X2      | ${stats.A_brier1x2.mean.toFixed(4)} | [${stats.A_brier1x2.low.toFixed(4)}, ${stats.A_brier1x2.high.toFixed(4)}]`);
  console.log(`RPS 1X2        | ${stats.A_rps1x2.mean.toFixed(4)} | [${stats.A_rps1x2.low.toFixed(4)}, ${stats.A_rps1x2.high.toFixed(4)}]`);
  console.log(`LL O/U 2.5     | ${stats.A_llO25.mean.toFixed(4)} | [${stats.A_llO25.low.toFixed(4)}, ${stats.A_llO25.high.toFixed(4)}]`);
  console.log(`LL O/U 4.5     | ${stats.A_llO45.mean.toFixed(4)} | [${stats.A_llO45.low.toFixed(4)}, ${stats.A_llO45.high.toFixed(4)}]`);
  console.log(`LL BTTS        | ${stats.A_llBTTS.mean.toFixed(4)} | [${stats.A_llBTTS.low.toFixed(4)}, ${stats.A_llBTTS.high.toFixed(4)}]`);

  console.log("\n=== COMPARAȚIE BASELINES (Log Loss 1X2) ===");
  const formatDiff = (d: any) => `${d.mean.toFixed(4)} [${d.low.toFixed(4)}, ${d.high.toFixed(4)}]${d.high < 0 ? ' (Sig. mai bun)' : d.low > 0 ? ' (Sig. mai slab)' : ' (Nonsig.)'}`;
  console.log(`Diferență A vs B (Equal): ${formatDiff(stats.diffAB)}`);
  console.log(`Diferență A vs C (Freq) : ${formatDiff(stats.diffAC)}`);

  console.log("\n=== VARIAȚII PARAMETRI (Informativ, risc overfitting) ===");
  console.log("Model | Log Loss | IC 95%");
  console.log("------|----------|-----------------------");
  varStats.forEach((v: any) => {
    console.log(`${v.name.padEnd(5)} | ${v.mean.toFixed(4)}   | [${v.low.toFixed(4)}, ${v.high.toFixed(4)}]`);
  });

  // --- Diagnostics ---
  const avgPX = evaluatedMatches.reduce((s, e) => s + e.A.draw, 0) / evaluatedMatches.length;
  const actualXFreq = evaluatedMatches.filter(e => e.outcomeIdx === 1).length / evaluatedMatches.length;

  const avgP1 = evaluatedMatches.reduce((s, e) => s + e.A.one, 0) / evaluatedMatches.length;
  const actual1Freq = evaluatedMatches.filter(e => e.outcomeIdx === 0).length / evaluatedMatches.length;

  const avgP2 = evaluatedMatches.reduce((s, e) => s + e.A.two, 0) / evaluatedMatches.length;
  const actual2Freq = evaluatedMatches.filter(e => e.outcomeIdx === 2).length / evaluatedMatches.length;

  const obsTotalGoals = evaluatedMatches.map(e => e.totalGoals);
  const obsMean = obsTotalGoals.reduce((s, v) => s + v, 0) / obsTotalGoals.length;
  const obsVar = obsTotalGoals.reduce((s, v) => s + Math.pow(v - obsMean, 2), 0) / (obsTotalGoals.length - 1);
  const poissonMean = evaluatedMatches.reduce((s, e) => s + e.lambdaA + e.lambdaB, 0) / evaluatedMatches.length;

  console.log("\n=== DIAGNOSTICE CALIBRARE ===");
  console.log(`Remize: P(X) mediu predictat = ${avgPX.toFixed(3)}, Frecvență observată = ${actualXFreq.toFixed(3)} (${evaluatedMatches.filter(e => e.outcomeIdx === 1).length}/${evaluatedMatches.length})`);
  console.log(`Gazdă : P(1) mediu predictat = ${avgP1.toFixed(3)}, Frecvență observată = ${actual1Freq.toFixed(3)}`);
  console.log(`Oaspete: P(2) mediu predictat = ${avgP2.toFixed(3)}, Frecvență observată = ${actual2Freq.toFixed(3)}`);
  console.log(`Total goluri: Media obs = ${obsMean.toFixed(2)}, Var obs = ${obsVar.toFixed(2)}, Media Poisson = ${poissonMean.toFixed(2)}`);
  console.log(`Status: ${obsVar < obsMean ? 'Subdispersată' : 'Supradispersată'} față de Poisson.`);

  // Reliability table P(1) and P(2)
  console.log("\n=== TABEL FIABILITATE (P1 & P2 combinat, 5 bins) ===");
  console.log("Bin       | N  | P mediu | Frecvență");
  console.log("----------|----|---------|----------");
  const bins = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
  for (let i = 0; i < bins.length - 1; i++) {
    const low = bins[i], high = bins[i+1];
    const pool: { p: number, hit: boolean }[] = [];
    evaluatedMatches.forEach(e => {
        if (e.A.one >= low && e.A.one < high) pool.push({ p: e.A.one, hit: e.outcomeIdx === 0 });
        if (e.A.two >= low && e.A.two < high) pool.push({ p: e.A.two, hit: e.outcomeIdx === 2 });
    });
    if (pool.length > 0) {
      const avgP = pool.reduce((s, x) => s + x.p, 0) / pool.length;
      const freq = pool.filter(x => x.hit).length / pool.length;
      console.log(`${low.toFixed(1)}-${high.toFixed(1)}   | ${String(pool.length).padEnd(2)} | ${avgP.toFixed(3)}   | ${freq.toFixed(3)}`);
    }
  }

  // Top 5 error matches
  console.log("\n=== TOP 5 MEIURI CU CEA MAI MARE EROARE (Log Loss 1X2) ===");
  const matchErrors = evaluatedMatches.map((e, idx) => ({
    home: e.home,
    away: e.away,
    score: e.score,
    error: metricsA.ll1x2[idx],
    lambdaA: e.lambdaA.toFixed(2),
    lambdaB: e.lambdaB.toFixed(2),
    pActual: (e.outcomeIdx === 0 ? e.A.one : e.outcomeIdx === 1 ? e.A.draw : e.A.two).toFixed(3)
  }));
  matchErrors.sort((a, b) => b.error - a.error);
  matchErrors.slice(0, 5).forEach((m, i) => {
    console.log(`${i+1}. ${m.home} - ${m.away} (${m.score}) | LL: ${m.error.toFixed(3)} | λA: ${m.lambdaA}, λB: ${m.lambdaB} | P(real): ${m.pActual}`);
  });

  // --- CSV Export ---
  const outDir = join(process.cwd(), 'scripts', 'out');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const csvHeader = "matchId,home,away,date,score,P1,PX,P2,realOutcome,loss\n";
  const csvRows = evaluatedMatches.map((e, idx) => {
    const outcome = e.outcomeIdx === 0 ? '1' : e.outcomeIdx === 1 ? 'X' : '2';
    return `${e.id},"${e.home}","${e.away}",${e.date.toISOString()},${e.score},${e.A.one.toFixed(4)},${e.A.draw.toFixed(4)},${e.A.two.toFixed(4)},${outcome},${metricsA.ll1x2[idx].toFixed(4)}`;
  }).join("\n");

  const csvPath = join(outDir, 'backtest-odds.csv');
  writeFileSync(csvPath, csvHeader + csvRows);
  console.log(`\nCSV exportat în: ${csvPath}`);

  // --- Final Summary ---
  console.log("\n=== REZUMAT FINAL ===");
  const beatsBaseline = stats.diffAB.high < 0 && stats.diffAC.high < 0;
  console.log(`1. Verdict: Motorul ${beatsBaseline ? 'BATE' : 'NU bate în mod semnificativ'} baseline-urile pe acest set de ${evaluatedMatches.length} meciuri.`);
  console.log(`2. Calibrare Remize: ${Math.abs(avgPX - actualXFreq) < 0.03 ? 'Bună' : avgPX > actualXFreq ? 'Supraestimată' : 'Subestimată'} (Predictat ${avgPX.toFixed(3)} vs Obs ${actualXFreq.toFixed(3)}).`);
  console.log(`3. Calibrare Gazdă/Oaspete: P(1) obs ${actual1Freq.toFixed(3)} vs pred ${avgP1.toFixed(3)}, P(2) obs ${actual2Freq.toFixed(3)} vs pred ${avgP2.toFixed(3)}.`);
  console.log(`4. Distribuție goluri: ${obsVar < obsMean ? 'Subdispersată' : 'Poisson-like'} (${obsVar.toFixed(2)} vs ${obsMean.toFixed(2)}).`);
  if (evaluatedMatches.length < 50) {
    console.log("5. NOTĂ: Eșantionul (n=31) este mic pentru concluzii definitive statistice.");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
