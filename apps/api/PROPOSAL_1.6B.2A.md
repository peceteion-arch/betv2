# BETV2 — PASUL 1.6B.2A.3: Corecturi finale de proiectare

## 1. Contract TypeScript (unchanged)

```typescript
// Reprezintă frecvența unui scor specific (x-y)
export interface ExactScoreFrequency {
  goalsFor: number;
  goalsAgainst: number;
  count: number;          // Numărul de apariții ale acestui scor exact
  rate: number;           // Proporția: count / matchesTotal (fără istoric nu apare)
}

// Distribuția globală a scorurilor exacte pentru un set de meciuri eligibile
export interface ScoreDistribution {
  matchesTotal: number;   // Totalul Mecurilor eligibile (identic cu `matches` din statistica de bază)
  scorelines: ExactScoreFrequency[]; // Lista scorurilor distincte, sortate determinist
}
```

### Invariante și comportament
- **Fără istoric**: `matchesTotal: 0`, `scorelines: []`.
- **Sortare deterministă**: Dupa `goalsFor` crescător, apoi `goalsAgainst` crescător.
  - Ex: `[{0,0}, {0,1}, {1,0}, {1,1}, {0,2}, ...]`
- **Rata**: `rate = count / matchesTotal` (doar pentru `matchesTotal > 0`; nu apare în listă când `matchesTotal = 0`).
- **Invariant de sumă**: `sum(scorelines.map(s => s.count)) === matchesTotal`.
- **Unicitate**: Fiecare pereche `(goalsFor, goalsAgainst)` apare o singură dată în `scorelines`.

## 2. Integrare fără contradicții (CORECTAT)

- **Nu modificăm** `BasicTeamStats` (rămâne utilizat și pentru statisticile acasă/deplasare).
- **Adăugăm** distribuția totală a echipei în `TeamProfile`:
  ```typescript
  export interface TeamProfile {
    teamId: string;
    basicStats: BasicTeamStats;
    form: TeamFormStats;
    homeAway: TeamHomeAwayStats;
    scoreDistribution: ScoreDistribution; // Nou
  }
  ```
- **Adăugăm** distribuția meciurilor directe în `H2HStats`:
  ```typescript
  export interface H2HStats {
    teamAId: string;
    teamBId: string;
    matches: number;
    teamAWins: number;
    draws: number;
    teamBWins: number;
    teamAGoals: number;
    teamBGoals: number;
    teamAGoalsPerMatch: number | null;
    teamBGoalsPerMatch: number | null;
    teamAWinRate: number | null;
    drawRate: number | null;
    teamBWinRate: number | null;
    averageTotalGoals: number | null;
    scoreDistribution: ScoreDistribution; // Nou
  }
  ```
- **Nu extindem** `HomeAwayStats` în această etapă. Distribuțiile distincte pentru acasă/deplasare vor fi evaluate separat.

## 3. Utilitar comun (NOU)

Creăm un fișier dedicat: `apps/api/src/odds-engine/helpers/score-distribution.helper.ts`

```typescript
/**
 * Calculează distribuția scorurilor exacte dintr-o listă de meciuri ELIGIBILE.
 * 
 * @param matches - Lista de meciuri care sunt DEJA eligibile (aplicaţi filtrul înainte)
 * @param teamId - ID-ul echipei din perspectiva căreia se calculează distribuția
 * @returns Obiectul ScoreDistribution cu scorurile sortate determinist
 * 
 * Note: Funcţia NU aplică filtrarea de eligibilitate. Este responsabilitatea apelantului
 * să passe doar meciurile care îndeplesc: status === 'FINISHED', homeScore !== null, 
 * awayScore !== null, matchDate < asOf.
 */
export function calculateScoreDistribution(
  matches: NormalizedMatch[], 
  teamId: string
): ScoreDistribution {
  const frequencyMap = new Map<string, ExactScoreFrequency>();

  for (const match of matches) {
    // Verificare apartenență echipei la meci (din contractul apelantului)
    const isHome = match.homeTeamId === teamId;
    const isAway = match.awayTeamId === teamId;
    
    if (!isHome && !isAway) {
      // Această situaţie nu ar trebui să se întâmple dacă apelantul filtrează corect
      // Dar pentru siguranţă, ignorăm meciurile în care echipa nu participă
      continue;
    }

    // Mapare corectă a scorurilor indiferent de locuinţă (acasă/deplasare)
    const goalsFor = isHome ? match.homeScore! : match.awayScore!;
    const goalsAgainst = isHome ? match.awayScore! : match.homeScore!;
    
    // Generare cheie unică pentru scor (format: "x-y")
    const key = `${goalsFor}-${goalsAgainst}`;
    
    const existing = frequencyMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      frequencyMap.set(key, {
        goalsFor,
        goalsAgainst,
        count: 1,
        rate: 0 // Va fi recalculat mai târziu
      });
    }
  }

  // Convert map to array and sort determinist
  const scorelines = Array.from(frequencyMap.values());
  scorelines.sort((a, b) => {
    if (a.goalsFor !== b.goalsFor) return a.goalsFor - b.goalsFor;
    return a.goalsAgainst - b.goalsAgainst;
  });

  // Calculate total matches and update rates
  const matchesTotal = scorelines.reduce((sum, entry) => sum + entry.count, 0);
  
  for (const entry of scorelines) {
    entry.rate = matchesTotal > 0 ? entry.count / matchesTotal : 0;
  }

  return { matchesTotal, scorelines };
}
```

### Semnătura utilitarului - explicări critice
- **Primește doar meciuri eligibile**: Utilitarul NU aplică filtrarea de eligibilitate (status, scoruri nenule, matchDate < asOf). 
  Această filtrare trebuie să fie aplicată de apelantul (`getTeamProfile` sau `getH2HStats`) înainte de a apela utilitarul.
  Aceasta evită duplicarea logicii de filtrare și asigură o singură sursă de adevăr pentru criterii de eligibilitate.
- **Nu folosi aserțiuni de tip !**: Deoarece funcţia primeşte doar meciuri eligibile (după contractul apelantului), 
  știm că `homeScore` și `awayScore` nu sunt `null`. Totuși, în cod, accesăm aceste valori prin `match.homeScore!` 
  și `match.awayScore!` doar după ce am verificat indirekt eligibilitatea prin filtrul apelantului.
  Dacă dorim să fie mai defensivi, putem adăuga verificări interne, dar aceasta ar duplica logica de eligibilitate.

## 4. Verificare apartenență și mapare scoruri

În ambele funcții (`getTeamProfile` și `getH2HStats`), înainte de a apela utilitarul:
1. **Filtrare eligibilitate**: Aplicăm aceleași reguli ca și la statistici existente:
   - `match.status === 'FINISHED'`
   - `match.homeScore !== null` și `match.awayScore !== null`
   - `match.matchDate < asOf` (strict)
2. **Verificare apartenență**: Pentru echipa de interes (`teamId`):
   - În `getTeamProfile`: Verificăm dacă `teamId` corespunde `homeTeamId` sau `awayTeamId` al meciului.
   - În `getH2HStats`: Pentru perspectiva echipei A, verificăm dacă meciul implicatează ambele echipe A și B 
     (deja făcut de provider, dar verificăm defensiv).
3. **Mapare scoruri**:
   - Dacă echipa este gazdă: `goalsFor = homeScore`, `goalsAgainst = awayScore`
   - Dacă echipa este ospitală: `goalsFor = awayScore`, `goalsAgainst = homeScore`

Această abordare asigură că perspektiva este corectă indiferent de locuinţă (acasă/deplasare).

## 5. Teste de consistență

Testele trebuie să verifică:

1. **Egalitatea totalurilor**:
   - Pentru `TeamProfile`: `profile.scoreDistribution.matchesTotal === profile.basicStats.matches`
   - Pentru `H2HStats`: `h2h.scoreDistribution.matchesTotal === h2h.matches`
   
   Aceasta demonstrează că distribuția folosește aceleași meciuri eligibile ca și statisticile de bază.

2. **Istoric gol**:
   - Echipe fără mecanuri eligibile → `matchesTotal: 0`, `scorelines: []`

3. **Scoruri repetate și distincte**:
   - Două mecanuri 1-1 → o intrare cu `count: 2`, `rate: 0.5` (dacă `matchesTotal=2`)
   - Mecuri 1-0, 0-1, 2-2 → trei intrări, fiecare cu `count: 1`

4. **Scorul 0-0**: Verifică apare corect în listă.

5. **Perspectiva H2H inversată**:
   - `getH2HStats('A','B').scoreDistribution` vs `getH2HStats('B','A').scoreDistribution`
   - Scorurile trebuie să fie inversate (ex: 3-1 devine 1-3) iar `matchesTotal` să fie egal.

6. **Locuinţă (acasă/deplasare)**:
   - Echipa A acasă 2-1 → intrare {2,1}
   - Echipa A în deplasare 1-2 → intrare {1,2}

7. **Filtrare temporală strictă**:
   - Mecanul cu `matchDate === asOf` trebuie exclus (nu contează în `matchesTotal`)

8. **Ordină deterministă**: Verifică ordonarea după `goalsFor` apoi `goalsAgainst`.

## 6. Fișiere de cod propuse

### Fișiere de creare
| Fișier | Scop |
| :--- | :--- |
| `apps/api/src/odds-engine/helpers/score-distribution.helper.ts` | **Nou**: Utilitar comun de agregare |

### Fișiere de modificare
| Fișier | Scop |
| :--- | :--- |
| `apps/api/src/odds-engine/features/team-profile.types.ts` | Adăugare `scoreDistribution: ScoreDistribution` |
| `apps/api/src/odds-engine/features/h2h-stats.types.ts` | Adăugare `scoreDistribution: ScoreDistribution` |
| `apps/api/src/odds-engine/features/team-profile.features.ts` | Integrare utilitar: filtrare eligibilitate + apel utilitar |
| `apps/api/src/odds-engine/features/h2h-stats.features.ts` | Integrare utilitar: filtrare eligibilitate + apel utilitar (cu perspectivă corectă) |
| `apps/api/tests/team-profile.features.test.ts` | Update teste pentru a verifica noul câmp și invariantele |
| `apps/api/tests/h2h-stats.features.test.ts` | Update teste pentru a verifica noul câmp, simetria și invariantele |

### Fișiere NEMODIFICATE (conform cerinţelor)
- `apps/api/src/odds-engine/features/team-basic-stats.features.ts` și `.types.ts`
- `apps/api/src/odds-engine/features/team-home-away.features.ts` și `.types.ts`
- `apps/api/src/odds-engine/features/team-form.features.ts` și `.types.ts`
- `apps/api/src/odds-engine/features/matchup-profile.features.ts` și `.types.ts`
- `apps/api/src/odds-engine/providers/*`
- `generateOdds()`, schema Prisma, decontarea pariurilor, frontendul, baza SQLite AJM

## ⚠️ Riscuri rămase

- **Breaking changes prin adăugarea de câmpuri noi** în `TeamProfile` și `H2HStats`: consumatorii acestor interfețe (inclusiv serializare, UI-uri) vor necesita actualizare. Deoarece adăugăm doar câmpuri noi fără a modifica cei existenţi, impactul este aditiv și compatibil în sensul că codul existent care nu foloseşte noul câmp va continua să funcționeze.
- **Corectitudinea perspectivelor** în H2H depinde de implementarea grijăsitoare a mapării scorurilor și verificării appartenenței echipei.

## ✅ Validare

După implementare, trebuie să rulezi:
- `npm run build` (verificare fără erori de tipare)
- `npm run test` (toate teste existente și noi trebuie să treacă)

---
*Document revizuit la: 2026-10-12*