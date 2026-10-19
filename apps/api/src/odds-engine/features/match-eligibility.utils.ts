import { NormalizedMatch } from '../providers/match-history.types';

/**
 * Regula comună de eligibilitate pentru meciuri în calculele statistice.
 * Un meci este eligibil numai dacă: status === 'FINISHED'; ambele scoruri sunt finite,
 * nenegative și întregi; matchDate este validă și strict înainte de asOf.
 *
 * Politica globală vs competiție (documentată explicit):
 * - Istoricul global al echipei, din toate competițiile, rămâne disponibil ca sursă.
 * - Istoricul competiției curente este păstrat separat.
 * - Acest pas NU combină cele două istorii și NU stabilește ponderi.
 * - Decizia de modelare matematică aparține etapei ulterioare.
 * - Nu inventăm clasamente sau valori de putere pentru echipe.
 */
export function isMatchEligible(match: NormalizedMatch, asOf: Date): boolean {
  // Meciurile acordate la masa verde sunt excluse explicit din calculele
  // statistice — scorul lor nu reflectă performanța reală a echipelor.
  if (match.isForfeit) return false;

  // 1. Status finalizat
  if (match.status !== 'FINISHED') return false;

  // 2. Ambele scoruri există și sunt numere finite
  if (match.homeScore === null || match.awayScore === null) return false;
  if (!Number.isFinite(match.homeScore) || !Number.isFinite(match.awayScore)) return false;

  // 3. Nenegative și întregi (nu transformăm lipsă în zero)
  if (match.homeScore < 0 || match.awayScore < 0) return false;
  if (!Number.isInteger(match.homeScore) || !Number.isInteger(match.awayScore)) return false;

  // 4. matchDate validă și strict anterioară asOf
  const matchDate = new Date(match.matchDate);
  const asOfDate = new Date(asOf);

  // Nu transformăm date invalide prin conversie implicită
  if (isNaN(matchDate.getTime()) || isNaN(asOfDate.getTime())) return false;

  // 5. Strict anterior; meciurile cu matchDate === asOf sunt excluse
  if (matchDate.getTime() >= asOfDate.getTime()) return false;

  return true;
}
