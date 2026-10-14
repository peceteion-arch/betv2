import { matchHistoryProvider } from '../providers/match-history.provider';
import { NormalizedMatch } from '../providers/match-history.types';
import { ExpectedGoalsResult } from './expected-goals.types';
import { isMatchEligible } from './match-eligibility.utils';

/**
 * Calculează golurile așteptate (xG) pentru gazde și oaspeți.
 * Formula finală (corectă matematic, cu factori ca rapoarte față de mediile globale):
 *   lambdaHome = compHomeAvg * homeAttackStrength * awayDefenseWeakness
 *   lambdaAway = compAwayAvg * awayAttackStrength * homeDefenseWeakness
 * unde factorii sunt rapoarte față de mediile istorice globale ale echipei
 * în rolul respectiv (gazdă / deplasare), iar compAvg este media competiției curente.
 * Regula temporală strictă: matchDate < asOf; numai FINISHED, scoruri finite, nenegative, întregi.
 */
export async function getExpectedGoals(
  homeTeamId: string,
  awayTeamId: string,
  asOf: Date,
  competitionId: string
): Promise<ExpectedGoalsResult> {
  // 1. Istoric competiție (provider aplică matchDate < asOf; filtrăm din nou pentru siguranță)
  const competitionMatches = await matchHistoryProvider.getCompetitionMatches(competitionId, asOf);
  const eligibleCompMatches = competitionMatches.filter(m => isMatchEligible(m, asOf) && m.competitionId === competitionId);

  // 2. Istoric global echipe (toate competițiile, strict înainte de asOf)
  const homeTeamMatches = await matchHistoryProvider.getTeamMatches(homeTeamId, asOf);
  const awayTeamMatches = await matchHistoryProvider.getTeamMatches(awayTeamId, asOf);

  // 3. Filtrează pentru orientarea corectă: gazda ACASĂ, oaspetele DEPLAŞARE
  const homeEligible = homeTeamMatches.filter(m => isMatchEligible(m, asOf) && m.homeTeamId === homeTeamId);
  const awayEligible = awayTeamMatches.filter(m => isMatchEligible(m, asOf) && m.awayTeamId === awayTeamId);

  // 4. Baseline competiție (media golurilor ACASĂ / DEPLAŞARE din competiția curentă)
  let compHomeGoalsAvg: number | null = null;
  let compAwayGoalsAvg: number | null = null;
  if (eligibleCompMatches.length > 0) {
    let compHomeGFSum = 0;
    let compAwayGFSum = 0;
    for (const m of eligibleCompMatches) {
      compHomeGFSum += m.homeScore!;
      compAwayGFSum += m.awayScore!;
    }
    compHomeGoalsAvg = compHomeGFSum / eligibleCompMatches.length;
    compAwayGoalsAvg = compAwayGFSum / eligibleCompMatches.length;
  }

  // 5. Statistici echipă — ISTORIC GLOBAL (rol corect)
  let hthGFAvg: number | null = null;
  let hthGAAvg: number | null = null;
  if (homeEligible.length > 0) {
    let sGF = 0, sGA = 0;
    for (const m of homeEligible) { sGF += m.homeScore!; sGA += m.awayScore!; }
    hthGFAvg = sGF / homeEligible.length;
    hthGAAvg = sGA / homeEligible.length;
  }

  let ataGFAvg: number | null = null;
  let ataGAAvg: number | null = null;
  if (awayEligible.length > 0) {
    let sGF = 0, sGA = 0;
    for (const m of awayEligible) { sGF += m.awayScore!; sGA += m.homeScore!; }
    ataGFAvg = sGF / awayEligible.length;
    ataGAAvg = sGA / awayEligible.length;
  }

  // 6. Mediile globale absolute (aproximare din întregul istoric al echipei, ambele roluri)
  // Folosite pentru definirea factorilor ca rapoarte față de media globală.
  const safeDiv = (num: number | null, den: number | null): number | null => {
    if (num === null || den === null || den <= 0 || !Number.isFinite(num) || !Number.isFinite(den)) return null;
    const r = num / den;
    return Number.isFinite(r) && r >= 0 ? r : null;
  };

  let globalHomeAvg: number | null = null;
  let globalHomeGAAvg: number | null = null;
  let globalAwayAvg: number | null = null;
  let globalAwayGAAvg: number | null = null;

  // Derivăm din toate meciurile eligibile ale fiecărei echipe (orice rol)
  const allHomeEligible = homeTeamMatches.filter(m => isMatchEligible(m, asOf));
  const allAwayEligible = awayTeamMatches.filter(m => isMatchEligible(m, asOf));

  if (allHomeEligible.length > 0) {
    let sumGF = 0, sumGA = 0;
    for (const m of allHomeEligible) {
      if (m.homeTeamId === homeTeamId) { sumGF += m.homeScore!; sumGA += m.awayScore!; }
      else { sumGF += m.awayScore!; sumGA += m.homeScore!; }
    }
    globalHomeAvg = sumGF / allHomeEligible.length;
    globalHomeGAAvg = sumGA / allHomeEligible.length;
  }
  if (allAwayEligible.length > 0) {
    let sumGF = 0, sumGA = 0;
    for (const m of allAwayEligible) {
      if (m.awayTeamId === awayTeamId) { sumGF += m.awayScore!; sumGA += m.homeScore!; }
      else { sumGF += m.homeScore!; sumGA += m.awayScore!; }
    }
    globalAwayAvg = sumGF / allAwayEligible.length;
    globalAwayGAAvg = sumGA / allAwayEligible.length;
  }

  // 7. Factorii explicit definiți (rapoarte față de mediile globale)
  // homeAttackStrength  = media goluri ACASĂ echipă / media globală a echipei (rol acasă)
  // awayDefenseWeakness = media goluri primite DEPLAŞARE echipă / media globală primită (rol deplasare)
  const homeAttackStrength = safeDiv(hthGFAvg, globalHomeAvg);
  const awayDefenseWeakness = safeDiv(ataGAAvg, globalAwayGAAvg);
  const awayAttackStrength = safeDiv(ataGFAvg, globalAwayAvg);
  const homeDefenseWeakness = safeDiv(hthGAAvg, globalHomeGAAvg);

  // 8. Calcul final λ cu verificare completă (fără împărțire la zero, NaN, Infinity, negativi)
  let lambdaHomeVal: number | null = null;
  if (compHomeGoalsAvg !== null && compHomeGoalsAvg > 0 && Number.isFinite(compHomeGoalsAvg)) {
    if (homeAttackStrength !== null && awayDefenseWeakness !== null && Number.isFinite(homeAttackStrength) && Number.isFinite(awayDefenseWeakness)) {
      lambdaHomeVal = compHomeGoalsAvg * homeAttackStrength * awayDefenseWeakness;
      if (!Number.isFinite(lambdaHomeVal) || lambdaHomeVal < 0) lambdaHomeVal = null;
    }
  }

  let lambdaAwayVal: number | null = null;
  if (compAwayGoalsAvg !== null && compAwayGoalsAvg > 0 && Number.isFinite(compAwayGoalsAvg)) {
    if (awayAttackStrength !== null && homeDefenseWeakness !== null && Number.isFinite(awayAttackStrength) && Number.isFinite(homeDefenseWeakness)) {
      lambdaAwayVal = compAwayGoalsAvg * awayAttackStrength * homeDefenseWeakness;
      if (!Number.isFinite(lambdaAwayVal) || lambdaAwayVal < 0) lambdaAwayVal = null;
    }
  }

  // Dacă lipsesc date pentru calculul unui factor, lambda devine null (nu inventăm)
  // (deja gestionat prin verificările de mai sus)

  return {
    home: { teamId: homeTeamId, lambdaHome: lambdaHomeVal, matchesUsed: homeEligible.length },
    away: { teamId: awayTeamId, lambdaAway: lambdaAwayVal, matchesUsed: awayEligible.length }
  };
}
