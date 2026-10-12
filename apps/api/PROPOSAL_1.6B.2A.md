# BETV2 — PASUL 1.6B.2A.2: Finalizarea designului pentru distribuția scorurilor exacte

## 1. Contract TypeScript

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

## 2. Integrare fără contradicții

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

## 3. Eligibilitate și perspectivă

- **Regula de eligibilitate** este aceeasi ca pentru statisticile existente:
  - `match.status === 'FINISHED'`
  - `match.homeScore !== null` și `match.awayScore !== null`
  - `match.matchDate < asOf` (strict, nu include data-limită).
- **Perspectiva echipei** (pentru `TeamProfile.scoreDistribution`):
  - Pentru fiecare meci eligibil, determinăm dacă echipa este gazdă или оспор.
  - `goalsFor` = scorul echipei (acasa sau in deplasare).
  - `goalsAgainst` = scorul adversarului.
- **Perspectiva H2H** (pentru `H2HStats.scoreDistribution`):
  - Scorul este întotdeauna din perspectiva **echipei A** (primul argument al funcției).
  - Dacă echipa A este gazdă: `goalsFor = homeScore`, `goalsAgainst = awayScore`.
  - Dacă echipa A este ospitală: `goalsFor = awayScore`, `goalsAgainst = homeScore`.
  - **Inversarea echipelor** (schimbarea lui `teamAId` cu `teamBId`) trebuie să inverseze și scorul:
    - Un meci cu scorul `3–1` din perspectiva A devine `1–3` din perspectiva B.

### Observații privind `NormalizedMatch`
```typescript
export interface NormalizedMatch {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  competitionId: string | null;
  matchday: number;
  matchDate: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
}
```
Toate câmpurile necesare sunt prezente.

## 4. Invariante (detaliat)

Pentru orice instanță `ScoreDistribution` derivată:
1. `sum(scorelines.map(s => s.count)) === matchesTotal`.
2. Fiecare pereche distinctă `(goalsFor, goalsAgainst)` apare exact o singură dată în `scorelines`.
3. Pentru `matchesTotal > 0`: pentru orice element din `scorelines`, `rate = count / matchesTotal`.
4. `matchesTotal` coincide cu numărul de meciuri eligibile filtrate după regulile de la secţiunea 3.
5. Dacă `matchesTotal = 0`, atunci `scorelines = []` și nu se efectuează nicio împărţire.

## 5. Fișiere și teste

### Fișiere de creare / modificare

| Fișier | Scop |
| :--- | :--- |
| `apps/api/src/odds-engine/features/distrib.types.ts` | **Nou**: defining `ExactScoreFrequency` și `ScoreDistribution`. |
| `apps/api/src/odds-engine/features/team-profile.types.ts` | Adăugare `scoreDistribution: ScoreDistribution` în `TeamProfile`. |
| `apps/api/src/odds-engine/features/h2h-stats.types.ts` | Adăugare `scoreDistribution: ScoreDistribution` în `H2HStats`. |
| `apps/api/src/odds-engine/features/team-basic-stats.features.ts` | Implementare funcție utilitară privată `calculateScoreDistribution(matches: NormalizedMatch[], teamId: string): ScoreDistribution` și integrare în `getBasicTeamStats`. |
| `apps/api/src/odds-engine/features/h2h-stats.features.ts` | Reutilizare aceleasi utilitare (posibil cu un parametru suplimentar pentru persp.) și integrare în `getH2HStats`. |
| `apps/api/src/odds-engine/features/team-profile.features.ts` | Actualizare pentru a returna noul câmp `scoreDistribution` din sub-obiectele sale (deoarece `TeamProfile` aggregatează deja `basicStats`, `form`, `homeAway`). Nu este nevoie de modificare majoră dacă utilizăm passthrough. |
| `apps/api/src/odds-engine/features/matchup-profile.features.ts` | Nu necesita modificare directă (deoarece folosește `getTeamProfile` și `getH2HStats` care au fost actualizate). |

### Utilitar de agregare (sugerat)
```typescript
function calculateScoreDistribution(matches: NormalizedMatch[], teamId: string): ScoreDistribution {
  const map = new Map<string, ExactScoreFrequency>();
  for (const m of matches) {
    const isHome = m.homeTeamId === teamId;
    const gf = isHome ? m.homeScore! : m.awayScore!;
    const ga = isHome ? m.awayScore! : m.homeScore!;
    const key = `${gf}-${ga}`;
    const entry = map.get(key);
    if (entry) {
      entry.count++;
    } else {
      map.set(key, { goalsFor: gf, goalsAgainst: ga, count: 1, rate: 0 }); // rate va fi recalculat
    }
  }
  const scorelines = Array.from(map.values());
  // sortare determinist: goalsFor asc, then goalsAgainst asc
  scorelines.sort((a, b) => {
    if (a.goalsFor !== b.goalsFor) return a.goalsFor - b.goalsFor;
    return a.goalsAgainst - b.goalsAgainst;
  });
  const total = scorelines.reduce((sum, s) => sum + s.count, 0);
  // recalculăm rate-ul
  for (const s of scorelines) {
    s.rate = total > 0 ? s.count / total : 0;
  }
  return { matchesTotal: total, scorelines };
}
```

### Teste necesare (pregătiți în `*.features.test.ts`)

1. **Scoruri repetate**: două meciuri `1-1` → o intrare cu `count: 2`, `rate: 0.5` (dacă `matchesTotal=2`).
2. **Scoruri distincte**: `1-0`, `0-1`, `2-2` → trei intrări, fiecare cu `count: 1`.
3. **Scorul 0-0**: verifică apare corect în listă.
4. **Istoric gol**: `matchesTotal: 0`, `scorelines: []`.
5. **Meciuri nefinalizate și scoruri `null`**: SCHEDULED, LIVE, VOID, sau FINISHED cu scor nul → excluse totalmente.
6. **Limita temporală strictă**: meci cu `matchDate === asOf` → exclus.
7. **Echipa acasă și în deplasare**: verifică că perspectiva se schimbă corect (ex: echipa A acasă 2-1 → {2,1}; echipa A în deplasare 1-2 → {1,2}).
8. **Perspectiva H2H inversată**: `getH2HStats('A','B')` vs `getH2HStats('B','A')` trebuie să aibă scorurile inversate și aceleaşi `matchesTotal`.
9. **Invariantul sumei aparițiilor**: asigură-te că suma `count` din `scorelines` este egală cu `matchesTotal` și cu `matches` din statistica de bază.
10. **Ordină deterministă**: verifică ordonarea după `goalsFor` apoi `goalsAgainst`.

### Restricții respectate

- Nu se modifică `generateOdds()`, schema Prisma, decontarea pariurilor, frontendul sau baza SQLite AJM.
- Nu se introduc Poisson, probabilități predictive sau cote.
- Nu se extinde scopul cu distribuții `last3/5/10` în această etapă.

## ⚠️ Riscuri rămase

- **Breaking changes prin adăugarea de câmpuri noi** în `TeamProfile` și `H2HStats`: toate consumatorii acestor interfețe vor necesita actualizare (de ex. serializare, UI-uri). Totuşi, deoarece adăugăm doar câmpuri și nu modificăm cei existenţi, impactul este de tip „aditiv”.
- **Complexitatea logicii de perspektivă** în H2H trebuie implementată cu grijă pentru a evita confundarea entre echipa gazdă și oaspete.
- **Performance**: agregarea scorurilor este O(n) și utilisează memorie suplimentară proporțională cu numărul de scoruri distincte (de obicei mic).

## ✅ Validare

După implementare, trebuie să rulezi:
- `npm run build` (verificare fara erori de tipare).
- `npm run test` (toate teste existente și noi trebuie să treacă).

---
*Document revizuit la: 2026-10-12*