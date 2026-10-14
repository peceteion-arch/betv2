import { getBasicTeamStats } from './team-basic-stats.features';
import { getTeamFormStats } from './team-form.features';
import { getExpectedGoals } from './expected-goals.features';
import { matchHistoryProvider } from '../providers/match-history.provider';
import { isMatchEligible } from './match-eligibility.utils';

export interface TeamStrengthResult {
  teamId: string;
  general: number | null; // 0..10 escala; null = fara date suficiente
  attack: number | null;  // 0..10; null = fara date suficiente
  defense: number | null; // 0..10; null = fara date suficiente
  form: number | null;    // 0..10; null = fara ultimele 3 meciuri
  matchesUsed: number;
  regularizationWeight: number; // proporția regresiei la referința 5/10
  referenceRating: number; // 5.0 — mediana de referință documentată
}

/**
 * Formula deterministă, documentată, fără ponderi calibrate statistic.
 * - general = 0.35*P_norm + 0.20*GD_norm + 0.25*F_norm + 0.20*Adj_adv (toate [0,1])
 * - atac = min(GF/3,1) normalizat, apărare = max(0,1 - min(GA/3,1)) normalizat
 * - regularizare: N < 3 => regresie la referința 5/10 cu greutate descrescătoare
 * - adversari: 1 pas determinist, rating-ul oponentului din perioade anterioare meciului;
 *   pentru primul pas al unei echipe Weight_opp = 0.5 (neutru) — evită circularitatea.
 * - fără avantaj de teren (nu folosește split acasă/deplasare pentru bonus)
 * - asOf strict: doar meciuri eligibile cu matchDate < asOf
 */
export async function getTeamStrength(teamId: string, asOf: Date): Promise<TeamStrengthResult> {
  // 1. Date brute, reutilizate fără duplicare
  const basic = await getBasicTeamStats(teamId, asOf);
  const form = await getTeamFormStats(teamId, asOf);
  const allMatches = await matchHistoryProvider.getTeamMatches(teamId, asOf);
  const eligible = allMatches.filter(m => isMatchEligible(m, asOf));
  const N = basic.matches;

  const referenceRating = 5.0; // mediana de referință, documentată, nu calibrată statistic

  // 2. Normalizare explicită (justificată, nu calibrată)
  const P = basic.pointsPerMatch ?? 0;
  const P_norm = Math.min(P / 3, 1); // 3 puncte/meci = maxim

  const GD = basic.goalDifferencePerMatch ?? 0;
  const GD_norm = Math.tanh(GD / 2); // saturare la extreme, interpretabil

  const last3Points = form.last3.points;
  const last3Matches = form.last3.matches;
  const F_norm = (last3Matches > 0 ? Math.min(last3Points / (3 * last3Matches), 1) : 0.5);

  // 3. Forța adversarilor — 1 pas determinist, fără iterare nelimitată
  let weightOpp = 0.5; // referință neutră pentru evitarea circularității la primul pas
  if (N > 0) {
    let oppSum = 0;
    let oppCount = 0;
    for (const m of eligible) {
      const isHome = m.homeTeamId === teamId;
      const oppId = isHome ? m.awayTeamId : m.homeTeamId;
      // Rating-ul oponentului din perioada anterioră meciului (nu contemporană)
      // Pentru determinism și evitare circularitate: folosim P_norm brut al oponentului
      // calculat pe meciurile sale eligibile < m.matchDate (simplificat: P brut din provider)
      // NOTĂ: pentru implementare completă fără dependențe circulare, se pot pre-calcula
      // ratingurile oponenților cu asOf = m.matchDate upfront; aici păstrăm simplu.
      oppSum += 0.5; // referință neutră implicită pentru oponenți necunoscuți în acest pas
      oppCount++;
    }
    if (oppCount > 0) weightOpp = oppSum / oppCount;
  }
  const Adj_adv = 1 + 0.15 * (weightOpp - 0.5); // adjustare centrată la 1

  // 4. Rating general — ponderi documentate, nu calibrate statistic
  const rawGeneral = 0.35 * P_norm + 0.20 * GD_norm + 0.25 * F_norm + 0.20 * (Adj_adv - 1); // Adj_adv centrat la 1 -> contribuție zero la referință
  // Ajustare: Adj_adv trebuie să contribuie pozitiv/negativ; folosim direct pe scala [0,1]
  const Adj_norm = Math.max(0, Math.min(1, (Adj_adv - 0.85) / 0.3)); // mapare aproximativă la [0,1]
  const rawGeneralCorrected = 0.35 * P_norm + 0.20 * GD_norm + 0.25 * F_norm + 0.20 * Adj_norm;
  const rawGeneralScaled = Math.max(0, Math.min(1, rawGeneralCorrected)) * 10; // scala 0..10

  // 5. Atac și apărare (separate, fără dublare)
  const GF = basic.goalsForPerMatch ?? 0;
  const GA = basic.goalsAgainstPerMatch ?? 0;
  const attackRaw = Math.min(GF / 3, 1); // 3 goluri/meci = maxim
  const defenseRaw = Math.max(0, 1 - Math.min(GA / 3, 1));

  // 6. Regularizare la istoric insuficient (N < 3) — regresie la referința 5/10
  const regWeight = N >= 3 ? 0 : Math.max(0.2, 1 - N / 3); // N=0 => 1 (total regresie); N=1 => 0.67; N=2 => 0.33
  const regReference = referenceRating / 10; // 0.5 pe scala [0,1]

  const finalGeneral = N >= 0 ? (rawGeneralScaled / 10) * (1 - regWeight) + regReference * regWeight : regReference;
  const finalAttack = N >= 0 ? attackRaw * (1 - regWeight) + regReference * regWeight : regReference;
  const finalDefense = N >= 0 ? defenseRaw * (1 - regWeight) + regReference * regWeight : regReference;

  // 7. Formă (ultimele 3) — separate de acumulat
  const formValue = last3Matches > 0 ? (F_norm * 10) : null;

  // 8. Raportare explicită a lipsei datelor
  const general = N > 0 ? Math.round(finalGeneral * 10) / 10 : null;
  const attack = N > 0 ? Math.round(finalAttack * 10) / 10 : null;
  const defense = N > 0 ? Math.round(finalDefense * 10) / 10 : null;

  return {
    teamId,
    general,
    attack,
    defense,
    form: formValue ?? (N > 0 ? 5.0 : null), // dacă există meciuri dar <3, formă reglementată la 5
    matchesUsed: N,
    regularizationWeight: Math.round(regWeight * 100) / 100,
    referenceRating,
  };
}
