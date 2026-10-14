/**
 * PASUL 3A — Audit matematic și reparare model de forță.
 * Formula documentată (fără calibrări statistice pretinse):
 *
 * Rating general (0..10):
 *   - P_norm = min(pointsPerMatch / 3, 1)  [puncte pe meci, 3 = maxim]
 *   - GD_norm = tanh(goalDifferencePerMatch / 2) [saturare interpretabila; 2 = ~0.96]
 *   - F_norm = puncte din ultimele 3 / (3*3), cu default 0.5 daca <3 meciuri (nu dubleaza global)
 *   - Formă separată de acumulat: F este doar din fereastra ultimelor 3, nu din total.
 *   - Adj_adv = 1 (neimplementat real din cauza lipsei ratingului opponent pre-calculat fără circularitate)
 *   rawGeneral = 0.35*P_norm + 0.20*GD_norm + 0.25*F_norm + 0.20*0  (fara dublare informatica)
 *   Scalat la 0..10 fara fortare artificiala: valorile 0..1 corespund direct, limitele sunt explicite.
 *
 * Atac (0..10):
 *   attackRaw = min(goalsForPerMatch / 3, 1)  [3 goluri/meci = maxim]
 *
 * Apărare (0..10):
 *   defenseRaw = max(0, 1 - min(goalsAgainstPerMatch / 3, 1)) [0 GA = 1, 3+ GA = 0]
 *
 * Regularizare (eșantioane mici):
 *   regWeight = N >= 3 ? 0 : max(0.2, 1 - N/3)
 *   N=0 => 1 (total regresie la 5); N=1 => 0.67; N=2 => 0.33.
 *   Referința = 5 / 10 = 0.5 pe scala [0,1].
 *   final = raw*(1-regWeight) + 0.5*regWeight (doar daca N>0; altfel null)
 *
 * Lipsă date:
 *   - N = 0 => general/attack/defense = null; form = null.
 *   - 1 <= N < 3 => ratinguri calculate cu regularizare; form = null (nu exisit ultimele 3).
 *   - N >= 3 => form = F_norm*10.
 *
 * Blocare raportată: ajustarea reală după adversari necesită pre-calculare ratinguri oponenți
 * fără circularitate (asOf = m.matchDate per oponent), care ar schimba arhitectura apeloilor.
 * Nu simulată cu valori constante (weightOpp = 0.5 neutru, ignora adversari reali — raportat clar).
 *
 * Nu se introduce Elo, bonus teren, coeficienți nejustificați, sau transformări forțate 0..10.
 */
import { getBasicTeamStats } from './team-basic-stats.features';
import { getTeamFormStats } from './team-form.features';

export interface TeamStrengthResult {
  teamId: string;
  general: number | null; // 0..10; null daca fara date suficiente (N == 0)
  attack: number | null;  // 0..10; null daca N == 0
  defense: number | null; // 0..10; null daca N == 0
  form: number | null;    // 0..10; null daca < 3 meciuri recente (fara dublare din global)
  matchesUsed: number;    // N (meciuri eligibile < asOf)
  regularizationWeight: number; // 0..1; >0 cand N < 3
  referenceRating: number; // 5.0 — mediana documentata, fara calibrage
}

export async function getTeamStrength(teamId: string, asOf: Date): Promise<TeamStrengthResult> {
  // 1. Date brute (doar modulele existente, fara duplicare)
  const basic = await getBasicTeamStats(teamId, asOf);
  const form = await getTeamFormStats(teamId, asOf);
  const N = basic.matches;

  const referenceRating = 5.0;
  const regReference = referenceRating / 10; // 0.5 pe scala [0,1]

  // 2. Normalizare compatibila, explicita, fara fortare 0..10
  const P_raw = basic.pointsPerMatch ?? 0;
  const P_norm = Math.min(P_raw / 3, 1); // 3 puncte/meci = maxim; ~0.67 pentru 2 p/m; ~0.33 pentru 1 p/m

  const GD_raw = basic.goalDifferencePerMatch ?? 0;
  const GD_norm = Math.tanh(GD_raw / 2); // ~0.76 la +2, ~0.96 la +3, interpretabila saturare

  // 3. Forma RECENTA — separata de acumulat; doar din ultimele 3, fara dublare
  const last3Matches = form.last3.matches;
  const last3Points = form.last3.points;
  const F_norm = (last3Matches > 0)
    ? Math.min(last3Points / (3 * last3Matches), 1) // 3 p/meci din ultimele 3 = maxim 1
    : 0.5; // default neutru cand <3 (nu 0, pentru a evita distorsionare);
           // dar form final = null daca N < 3, deci acest default nu afecteaza output final direct

  // 4. Ajustare adversari — BLINCA: nu implementata real din cauza arquiteturii.
  //    Fara simulare cu constante. Contributia = 0 (niciun bonus/penalty pretins).
  const Adj_adv_contribution = 0; // explicat: needs opponent pre-computation per m.matchDate

  // 5. Rating general — ponderi documentate, nu calibrate statistic
  const rawGeneral01 = 0.35 * P_norm + 0.20 * GD_norm + 0.25 * F_norm + 0.20 * Adj_adv_contribution;
  // Limitare explicita (nu fortare): daca >1, cap la 1; daca <0, la 0 (nu ar trebui cu termeni non-negativi)
  const rawGeneralClamped = Math.max(0, Math.min(1, rawGeneral01));
  const rawGeneralScaled = rawGeneralClamped * 10; // 0..10 direct

  // 6. Atac / Apărare separate — fara dublare cu total
  const GF_raw = basic.goalsForPerMatch ?? 0;
  const attackRaw = Math.min(GF_raw / 3, 1); // 3 goluri/meci = maxim

  const GA_raw = basic.goalsAgainstPerMatch ?? 0;
  const defenseRaw = Math.max(0, 1 - Math.min(GA_raw / 3, 1)); // 0 GA => 1; 3+ GA => 0

  // 7. Regularizare pentru eșantioane mici
  // N = 0 => 1 (total regresie); N = 1 => 0.67; N = 2 => 0.33; N >= 3 => 0
  const regWeight = N >= 3 ? 0 : Math.max(0.2, 1 - N / 3);

  // 8. Aplicare regularizare (doar daca N > 0; altfel null mai jos)
  const applyReg = (raw01: number) => raw01 * (1 - regWeight) + regReference * regWeight;

  const finalGeneral01 = N > 0 ? applyReg(rawGeneralClamped) : regReference;
  const finalAttack01 = N > 0 ? applyReg(attackRaw) : regReference;
  const finalDefense01 = N > 0 ? applyReg(defenseRaw) : regReference;

  // 9. Scalare la 0..10 pentru output (doar daca N > 0)
  const general = N > 0 ? Math.round(finalGeneral01 * 10) / 10 : null; // 1 zecimala; 7.53 => 7.5
  const attack = N > 0 ? Math.round(finalAttack01 * 10) / 10 : null;
  const defense = N > 0 ? Math.round(finalDefense01 * 10) / 10 : null;

  // 10. Formă — doar daca exista ultimele 3 meciuri (fara dublare cu global)
  const formValue = (last3Matches >= 3 && N > 0) ? Math.round(F_norm * 10) / 10 : null; // 1 zecimala

  return {
    teamId,
    general,
    attack,
    defense,
    form: formValue,
    matchesUsed: N,
    regularizationWeight: Math.round(regWeight * 100) / 100,
    referenceRating,
  };
}
