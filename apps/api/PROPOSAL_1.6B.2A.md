# BETV2 — PASUL 1.6B.2A: Proiectarea distribuției scorurilor exacte

## ANALIZĂ TEHNICĂ

După o analiză completă a repository-ului, am identificat următoarele observații pentru implementarea distribuției scorurilor exacte.

### 📊 Arhitectură Actuală

| Component | Sarcini Actuale | Medii/Rate deja implementate |
|-----------|----------------|-----------------------------|
| `BasicTeamStats` | Statistici totale (matches, wins, etc.) | `pointsPerMatch`, `goalsForPerMatch`, etc. (deja `number | null`) |
| `TeamFormStats` | Forma recentă (last3/5/10) | Aceleași medii/rate (deja `number | null`) |
| `H2HStats` | Statistici cap-la-cap | `teamAGoalsPerMatch`, `teamBGoalsPerMatch`, etc. (deja `number | null`) |
| `TeamProfile` | Compune din `basicStats + form + homeAway` | - |

---

### 🎯 Propunere: Distribuția Scorurilor Exacte

#### 1. Contract TypeScript
```typescript
export interface ScoreDistribution {
  goalsFor: number;       // Total goluri marcate
  goalsAgainst: number;   // Total goluri primite
  count: number;          // Număr meciuri eligibile (invariant: count = matches)
  rate: number | null;    // Media golurilor per meci (goalsFor / count), null dacă count = 0
}
```

#### 2. Integrare (Opțiunea C - Recomandată)
Ambele interfețe `BasicTeamStats` și `H2HStats` vor primi `scoreDistribution`.
*   **Avantaje**: Acoperire completă atât pentru perspectivele individuale ale echipei, cât și pentru cele H2H.
*   **Costuri**: Actualizarea tipurilor și a funcțiilor de agregare.

#### 3. Invariante și Comportament
*   `count` este numărul total de meciuri eligibile (`matchDate < asOf` și `status === 'FINISHED'`).
*   `rate = goalsFor / count` dacă `count > 0`, altfel `null`.
*   Fără istoric: `count = 0`, `goalsFor = 0`, `rate = null`.

---

### 📋 Cazuri de Test
1.  **Zero matches**: `count: 0`, `rate: null`.
2.  **Există meciuri cu scor 0**: `count > 0`, `goalsFor: X`, `rate: X / count`.
3.  **Filtrare temporală**: Meciurile `matchDate >= asOf` excluse.
4.  **Status**: Meciurile non-FINISHED excluse.
5.  **H2H inversat**: `getH2HStats('A', 'B')` vs `getH2HStats('B', 'A')` trebuie să fie simetrice.
6.  **Home/Away**: Independență totală între distribuțiile pe teren propriu și în deplasare.

---

### 🚀 Ordinea Implementării
1.  **Actualizare Tipurile**: Adăugare `ScoreDistribution` în `team-basic-stats.types.ts` și `h2h-stats.types.ts`.
2.  **Implementare Funcții**: Modificarea `getBasicTeamStats` și `getH2HStats` pentru a calcula distribuția.
3.  **Update Tipurile Compuse**: `TeamProfile` / `MatchupProfile` (dacă e necesar).
4.  **Testare**: Update teste unitare pentru a acoperi toate cazurile din secțiunea de mai sus.
5.  **Validare**: Execuție `npm run build` și `npm run test`.

### ⚠️ Riscuri
*   **Breaking changes**: Modificarea contractelor (`BasicTeamStats`, `H2HStats`) va necesita actualizarea tuturor consumatorilor.
*   **Complexitate**: H2H inversat necesită atenție sporită pentru a păstra simetria.

---
*Raport generat la: 2026-10-12*