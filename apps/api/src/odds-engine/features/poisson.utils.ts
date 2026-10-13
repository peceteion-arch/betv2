/**
 * Utilități matematice pentru distribuția Poisson aplicată în fotbal.
 * Metodă de calcul pentru probabilitatea P(X = k) = (lambda^k * e^-lambda) / k!
 */

/**
 * Utilități matematice pentru distribuția Poisson aplicată în fotbal.
 * Metodă de calcul pentru probabilitatea P(X = k) = (lambda^k * e^-lambda) / k!
 */

export interface PoissonProbabilities {
  lambda: number;
  probabilities: number[]; // Indexul este numărul de goluri
}

export interface Calculate1X2Result {
  one: number;
  draw: number;
  two: number;
  excludedProb: number;
  limitInfo: {
    maxHome: number;
    maxAway: number;
    excludedMass: number;
  };
}

/**
 * Calculează probabilitatea P(X = k) pentru o distribuție Poisson cu parametru lambda.
 */
export function poissonProb(k: number, lambda: number): number {
  if (lambda < 0 || k < 0 || !Number.isFinite(lambda) || !Number.isFinite(k)) {
    return 0;
  }
  if (lambda === 0) {
    return k === 0 ? 1 : 0;
  }
  // Formula: exp(k * ln(lambda) - lambda - ln(k!))
  // Pentru stabilitate numerică, folosim log-space.
  return Math.exp(k * Math.log(lambda) - lambda - logFactorial(k));
}

function logFactorial(n: number): number {
  if (n <= 1) return 0;
  let res = 0;
  for (let i = 2; i <= n; i++) {
    res += Math.log(i);
  }
  return res;
}

/**
 * Calculează probabilitatea unui scor exact (g - a)
 */
export function exactScoreProb(g: number, a: number, lambdaHome: number, lambdaAway: number): number {
  return poissonProb(g, lambdaHome) * poissonProb(a, lambdaAway);
}

/**
 * Calculează probabilitățile 1, X, 2 folosind o limită adaptivă pentru a asigura precizia.
 *
 * @param lambdaHome Media golurilor pentru gazdă
 * @param lambdaAway Media golurilor pentru oaspeți
 * @param tolerance Toleranța maximă acceptată pentru masa probabilistă exclusă (default 1e-9)
 * @param absoluteMaxLimit Limita de siguranță pentru a preveni bucle infinite (default 100)
 */
export function calculate1X2(
  lambdaHome: number,
  lambdaAway: number,
  tolerance = 1e-9,
  absoluteMaxLimit = 100
): Calculate1X2Result {
  let one = 0;
  let draw = 0;
  let two = 0;
  let totalProb = 0;

  let maxHome = 10;
  let maxAway = 10;

  // Încercăm să găsim limitele adaptiv
  // Începem cu o limită de bază și creștem dacă masa exclusă e prea mare
  let currentIter = 0;
  const maxIterations = 10; // Iterăm de maxim 10 ori pentru a ajusta limitele

  while (currentIter < maxIterations) {
    one = 0;
    draw = 0;
    two = 0;
    totalProb = 0;

    for (let g = 0; g <= maxHome; g++) {
      for (let a = 0; a <= maxAway; a++) {
        const prob = exactScoreProb(g, a, lambdaHome, lambdaAway);
        totalProb += prob;
        if (g > a) one += prob;
        else if (g === a) draw += prob;
        else two += prob;
      }
    }

    const excludedProb = 1 - totalProb;

    if (excludedProb <= tolerance || maxHome >= absoluteMaxLimit || maxAway >= absoluteMaxLimit) {
      break;
    }

    // Creștem limitele adaptiv bazat pe lambda
    // Dacă lambda e mare, avem nevoie de limite mai mari.
    maxHome = Math.max(maxHome + 5, Math.ceil(lambdaHome * 3));
    maxAway = Math.max(maxAway + 5, Math.ceil(lambdaAway * 3));

    // Capsăm la limita absolută de siguranță
    maxHome = Math.min(maxHome, absoluteMaxLimit);
    maxAway = Math.min(maxAway, absoluteMaxLimit);

    currentIter++;
  }

  const finalExcludedProb = Math.max(0, 1 - totalProb);

  return {
    one,
    draw,
    two,
    excludedProb: finalExcludedProb,
    limitInfo: {
      maxHome,
      maxAway,
      excludedMass: finalExcludedProb
    }
  };
}
