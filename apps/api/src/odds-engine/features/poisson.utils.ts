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
  converged: boolean;
  limitInfo: {
    maxHome: number;
    maxAway: number;
    excludedMass: number;
    errorEstimate: number;
  };
}

/**
 * Calculează probabilitatea P(X = k) pentru o distribuție Poisson cu parametru lambda.
 * @param k Numărul de goluri (trebuie să fie întreg, finit și >= 0)
 * @param lambda Parametrul distribuției (trebuie să fie finit și >= 0)
 * @returns Probabilitatea calculată sau 0 dacă parametrii sunt invalizi.
 */
export function poissonProb(k: number, lambda: number): number {
  if (
    !Number.isFinite(k) ||
    !Number.isFinite(lambda) ||
    lambda < 0 ||
    k < 0 ||
    !Number.isInteger(k)
  ) {
    return 0;
  }
  if (lambda === 0) {
    return k === 0 ? 1 : 0;
  }
  // Formula: exp(k * ln(lambda) - lambda - ln(k!))
  // Pentru stabilitate numerică, folosim log-space.
  const logP = k * Math.log(lambda) - lambda - logFactorial(k);
  const p = Math.exp(logP);

  return Number.isFinite(p) ? p : 0;
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
 * @param g Goluri gazdă
 * @param a Goluri oaspeți
 * @param lambdaHome Lambda gazdă
 * @param lambdaAway Lambda oaspeți
 * @returns Probabilitatea scorului exact. Returnează 0 pentru parametri invalizi sau scoruri fracționare.
 */
export function exactScoreProb(g: number, a: number, lambdaHome: number, lambdaAway: number): number {
  if (!Number.isInteger(g) || !Number.isInteger(a)) {
    return 0;
  }
  return poissonProb(g, lambdaHome) * poissonProb(a, lambdaAway);
}

/**
 * Calculează probabilitățile 1, X, 2 folosind o limită adaptivă pentru a asigura precizia.
 *
 * @param lambdaHome Media golurilor pentru gazdă (trebuie să fie număr finit >= 0)
 * @param lambdaAway Media golurilor pentru oaspeți (trebuie să fie număr finit >= 0)
 * @param tolerance Toleranța maximă acceptată pentru masa probabilistă exclusă (0 < tolerance < 1, default 1e-9)
 * @param absoluteMaxLimit Limita de siguranță pentru a preveni bucle infinite (număr întreg finit > 0, default 100)
 * @returns Obiectul care conține probabilitățile, starea de convergență și informații despre limite.
 */
export function calculate1X2(
  lambdaHome: number,
  lambdaAway: number,
  tolerance = 1e-9,
  absoluteMaxLimit = 100
): Calculate1X2Result {
  // Validare input
  if (
    !Number.isFinite(lambdaHome) ||
    !Number.isFinite(lambdaAway) ||
    lambdaHome < 0 ||
    lambdaAway < 0 ||
    !Number.isFinite(tolerance) ||
    tolerance <= 0 ||
    tolerance >= 1 ||
    !Number.isFinite(absoluteMaxLimit) ||
    absoluteMaxLimit <= 0 ||
    !Number.isInteger(absoluteMaxLimit)
  ) {
    return {
      one: 0,
      draw: 0,
      two: 0,
      excludedProb: 1,
      converged: false,
      limitInfo: {
        maxHome: 0,
        maxAway: 0,
        excludedMass: 1,
        errorEstimate: 1,
      },
    };
  }

  let one = 0;
  let draw = 0;
  let two = 0;
  let totalProb = 0;

  let maxHome = 10;
  let maxAway = 10;

  // Limita inițială nu poate depăși limita absolută cerută
  maxHome = Math.min(maxHome, absoluteMaxLimit);
  maxAway = Math.min(maxAway, absoluteMaxLimit);

  let currentIter = 0;
  const maxIterations = 15;
  let converged = false;

  // Caz degenerat: limita absolută prea mică (0) — nimic nu se calculează
  if (maxHome === 0 || maxAway === 0) {
    return {
      one: 0,
      draw: 0,
      two: 0,
      excludedProb: 1,
      converged: false,
      limitInfo: {
        maxHome,
        maxAway,
        excludedMass: 1,
        errorEstimate: 1,
      },
    };
  }

  while (currentIter < maxIterations) {
    // Calculăm o singură dată pentru perechea curentă de limite
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

    const currentExcludedProb = 1 - totalProb;

    // Verificăm dacă am atins toleranța
    if (currentExcludedProb <= tolerance) {
      converged = true;
      break;
    }

    // Am atins limita maximă atât pentru home cât și away — nu putem crește mai mult
    if (maxHome >= absoluteMaxLimit && maxAway >= absoluteMaxLimit) {
      break;
    }

    // Creștem limitele adaptiv, fără a depăși limita absolută
    maxHome = Math.min(Math.max(maxHome + 5, Math.ceil(lambdaHome * 3)), absoluteMaxLimit);
    maxAway = Math.min(Math.max(maxAway + 5, Math.ceil(lambdaAway * 3)), absoluteMaxLimit);

    currentIter++;
  }

  // Masa exclusă se estimează ca lipsa față de 1 a probabilităților incluse.
  // Nu forțăm zero: dacă calculul numeric indică o masă negativă (eroare de
  // rotundire), aceasta este semnalată ca atenție, nu tăcută.
  const rawExcludedProb = 1 - totalProb;
  const finalExcludedProb = rawExcludedProb;

  // O masă negativă este o indicație clară de eroare numerică (totalProb > 1),
  // nu un rezultat valid; nu putem pretinde convergență într-un astfel de caz.
  if (finalExcludedProb < 0) {
    converged = false;
  }

  return {
    one,
    draw,
    two,
    excludedProb: finalExcludedProb,
    converged,
    limitInfo: {
      maxHome,
      maxAway,
      excludedMass: finalExcludedProb,
      errorEstimate: finalExcludedProb,
    },
  };
}
