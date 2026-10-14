import { poissonProb, calculate1X2, exactScoreProb } from './poisson.utils';

export interface MarketProbabilities {
  one: number; draw: number; two: number;
  oneX: number; x2: number; twelve: number;
  over05: number; under05: number;
  over15: number; under15: number;
  over25: number; under25: number;
  over35: number; under35: number;
  over45: number; under45: number;
  bttsYes: number; bttsNo: number;
  odd: number; even: number;
  exactScores: Record<string, number>;
  converged: boolean;
  excludedProb: number;
  limitInfo: { maxHome: number; maxAway: number; excludedMass: number; errorEstimate: number };
  valid: boolean;
}

function sumValidP(prob: number, max: number) { return Math.min(1, Math.max(0, prob)); }

export function calculateMarketProbabilities(lambdaHome: number, lambdaAway: number): MarketProbabilities {
  const res1X2 = calculate1X2(lambdaHome, lambdaAway, 1e-9, 100);
  const valid = res1X2.converged;
  const excluded = res1X2.excludedProb;

  // Distribuție comună scoruri (limită adaptivă via poisson.util intern)
  const maxH = res1X2.limitInfo.maxHome;
  const maxA = res1X2.limitInfo.maxAway;

  let over05 = 0, over15 = 0, over25 = 0, over35 = 0, over45 = 0;
  let bttsYes = 0, odd = 0;
  const exact: Record<string, number> = {};

  for (let h = 0; h <= maxH; h++) {
    for (let a = 0; a <= maxA; a++) {
      const p = exactScoreProb(h, a, lambdaHome, lambdaAway);
      const key = `${h}-${a}`;
      exact[key] = p;
      const total = h + a;
      if (total > 0.5) over05 += p;
      if (total > 1.5) over15 += p;
      if (total > 2.5) over25 += p;
      if (total > 3.5) over35 += p;
      if (total > 4.5) over45 += p;
      if (h > 0 && a > 0) bttsYes += p;
      if (total % 2 === 1) odd += p;
    }
  }

  return {
    one: res1X2.one, draw: res1X2.draw, two: res1X2.two,
    oneX: res1X2.one + res1X2.draw,
    x2: res1X2.draw + res1X2.two,
    twelve: res1X2.one + res1X2.two,
    over05: over05, under05: 1 - over05,
    over15, under15: 1 - over15,
    over25, under25: 1 - over25,
    over35, under35: 1 - over35,
    over45, under45: 1 - over45,
    bttsYes, bttsNo: 1 - bttsYes,
    odd, even: 1 - odd,
    exactScores: exact,
    converged: valid,
    excludedProb: excluded,
    limitInfo: res1X2.limitInfo,
    valid,
  };
}
