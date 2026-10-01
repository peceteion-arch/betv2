# AUDIT TEHNIC BETV2

**Data:** 2026-09-30
**Commit analizat:** `c0fbfe4` (working tree curat)
**Metoda:** inspecție statică a codului sursă. Fără pornire de servere, fără modificări de cod, fără commit.
**Stack confirmat:** Prisma **5.22.0**, Express 4, TypeScript `strict`, PostgreSQL 16, React 18 + Vite, Zod.
**Teste rulate:** API 35/35 pass, Web 3/3 pass (fără modificări).

---

## 1. EXECUTIVE SUMMARY

Fluxul de bani este, în esență, **corect pe calea principală**. Cele trei operații care ar
produce double-payout / double-refund (debit la plasare, refund la anulare, payout/void la
lichidare) sunt toate protejate de o verificare de status făcută **înainte** de scriere, iar
`placeBet` folosește `tx.user.update({ where: { id, balance: { gte: stake } } })` — un
compare-and-swap atomic, protejat la nivel de rând de Postgres. Scenariile A, B, C, D, E și F
cerute de brief sunt analizate în §7; **niciunul nu produce double payout sau double refund în
single-process deployment**.

Totuși, auditul a identificat defecte reale care produc exact simptomele cerute — prin
mecanisme diferite de un simplu TOCTOU:

1. **[CRITIC] Procentaj trunchiat pe selecție invalidă.** `checkSelectionWon` returnează
   `false` (pierdere) pentru orice selecție pe care nu o recunoaște — nu `null` (void). În
   plus, citirea echipei în piețele de handicap este inversată. O selecție invalidă nu este
   respinsă la plasare: este **decontată ca pierdere**. La un meci cu handicap, ambele picioane
   ale pieței pierd — deci o piață întreagă este inamică jucătorului.
2. **[CRITIC] Meci `FINISHED` fără scor decontează automat ca pierdere.** `updateScoreSchema`
   *forțează* statusul implicit `FINISHED` (`schema.prisma:72-76`, `env.ts:75`), iar
   `checkSelectionWon:267-268` întoarce `false` (nu `null`) pentru scor lipsă. Un meci marcat
   terminat înainte de a exista scor distruge ireversibil toate pariile pe el.
3. **[HIGH] `settlePendingBets()` rulează toate pariile într-o singură tranzacție** cu timeout
   implicit Prisma de 5000 ms (`bet.service.ts:163`). Nu este race condition, ci
   indisponibilitate: peste această limită întreaga lichidare este rollbackată. Niciun parametră
   `timeout`/`maxWait` nu este setată în niciunul din cele trei apeluri `$transaction`.
4. **[HIGH] `updateStats` pierde actualizări concurent** — face read-modify-write pe
   `betsCount`/`betsWon`/`profit` (`user.service.ts:84-108`). Pierdere de actualizare, nu
   dublare.
5. **[HIGH] `getById(betId, userId)` — logică de autorizare inversată** (`bet.service.ts:135-138`):
   verifică rolul **apelantului**, nu al **proprietarului**. Un admin poate citi orice pariu
   (intenționat), dar un non-admin primește `404` pentru pariu inexistent și `404` pentru pariu
   al altui utilizator — comportament corect prin accident, nu prin design.
6. **[MEDIUM] `betsCount` include pariile anulate manual**, deci "Derrotas" din Dashboard
   (`Dashboard.tsx:127`) numără explicit pariile pe care utilizatorul le-a anulat.
7. **[MEDIUM] `totalOdds` rotunjit ≠ `potentialReturn` calculat din cotele nerotunjite** →
   cifre afișate și cifre plătite diferă. Exemple numerice în §8.
8. **[MEDIUM] Notificarea `BET_CREATED` este trimisă în afara tranzacției** (`bet.service.ts:93`),
   iar mesajul ei afișează `totalOdds` nerotunjit, în contradicție cu valoarea stocată.

Nu am găsit niciun IDOR exploatabil, niciun bypass de autorizare, nicio injecție. Detaliile
complete în §2–§12.

---

## 2. CRITICAL

### [CRITICAL] `checkSelectionWon` decontează selecțiile nerecunoscute ca PIERDERE, nu VOID

- **File:** `apps/api/src/services/bet.service.ts`
- **Function:** `checkSelectionWon()`
- **Lines:** 261–352 (în special 290–298, 300–303, 310–318, 320–333, 335–336, 349–350)
- **Problem:** Funcția are trei ieșiri: `true` (câștig), `false` (pierdere) și `null` (void).
  Dar `false` este și valoarea de return pentru **orice selecție nerecunoscută**. În
  `settlePendingBets` (`:194-212`) doar `null` activează ramura de void; orice `false` — inclusiv
  unul produs pentru că selecția nu a fost recunoscută — activează `anyLost = true` și pierde
  întreaga pariu.
- **Exact scenario:**
  1. `odds.json` conține `HANDICAP_n1_5: { "Casa -1.5": 2.31, "Fora 1.5": 1.77 }`.
  2. Utilizatorul pariază pe `"Fora 1.5"`.
  3. Meciul se termină 2-1. `checkSelectionWon('HANDICAP_n1_5', 'Fora 1.5', m)`:
     - `selection.includes('Casa')` → `false` (șirul e `"Fora 1.5"`)
     - intră pe ramura `return (away - 1.5) > home` → `(1 - 1.5) > 2` → `-0.5 > 2` → **`false`**
  4. Corect ar fi fost: echipa vizitatoare primește +1.5, deci `1 + 1.5 = 2.5 > 2` → **câștig**.
  5. Rezultat: pariu pierdută, `stake` pierdut, statistică `betsCount++`, `profit -= stake`.
- **Problemă paralelă, aceeași cauză:** `MARCAS_*` (`:289-298`) folosesc
  `selection === 'Mais X.5' ? cond : total < X.5`. Orice selecție diferită de cea mai mare
  (de exemplul `"Mais 3.5"` pe o piață `MARCAS_2_5`, sau un typo) e tratată ca **Under**.
  `AMBAS_MARCAM` (`:300-303`), `IMPAR_PAR` (`:335-336`) și `DUPLA_HIPOTESE` (`:283-287`) au
  aceeași structură `if (sel === A) ... if (sel === B) ... return false`.
- **De ce nu e „doar un edge case":** `checkSelectionWon` nu are whitelist de selecții valide, iar
  `placeBet` nu validează `selection` — doar verifică existența rândului în `Odds`. Orice
  piață nouă adăugată în `odds.json` fără branch în `switch` devine automat o piață care pierde
  întotdeauna. Piața `HANDICAP_0_0` (`:326-327`) returnează corect `null`, dar celelalte patru
  market-uri de handicap au branch-uri.
- **Impact:**
  - **Pierdere de bani:** utilizatorul pierde creditele pe selecții pe care platforma le vindea
    cu cote reale (din `odds.json`).
  - **Incorectitudine statistică:** `betsLost`/`profit`/`ROI` sunt corupte; un handicap câștigător
    e înregistrat ca înfrângere.
  - **Este un joc cu părtinie unică** pe piețele de handicap: la `-1.5`/`-0.5` ambele picioane
    pierd, indiferent de rezultat. La `+0.5`/`+1.5` doar „Casa" (adică handicapul, care ar fi
    trebuit să câștige) e singura care poate câștiga — dar formula e tot inversată.
- **Recommended fix:**
  1. Întoarce `null` (void) în loc de `false` pentru selecții nerecunoscute, ca ramura
     `default:` (`:349-350`) și fiecare `return false` de la final de ramură.
  2. Corectează formulele de handicap: `Casa` aplică handicapul gazdei (`home + hc`), `Fora`
     aplică handicapul oaspeților (`away - hc`), citind semnul din `selection`, nu din market.
     Verifică întâi care dintre sensuri e corect în feed (NEOCONFIRMAT — necesită verificare/test
     împotriva sursei `oddspedia`).
  3. **Defensiv (înainte de orice alt fix):** în `placeBet`, după ce `dbOdd` e găsit, apelează
     `checkSelectionWon` pe un meci-sentinel și **respinge** selecția dacă rezultatul ar fi
     `false` pentru un motiv de selecție invalidă. Alternativ mai simplu: definește și exportă o
     funcție `isValidSelection(market, selection)` și verific-o în `placeBet`.

### [CRITICAL] Meci `FINISHED` fără scor decontează automat ca PIERDERE

- **File:** `apps/api/src/services/bet.service.ts` + `apps/api/src/config/env.ts`
- **Function:** `checkSelectionWon()` / `settlePendingBets()` / `updateScoreSchema`
- **Lines:** `bet.service.ts:267-268`, `bet.service.ts:189-212`; `env.ts:72-76`; `match.service.ts:233-237`
- **Problem:** `checkSelectionWon` începe cu:
  ```ts
  if (match.homeScore === null || match.homeScore === undefined) return false;
  if (match.awayScore === null || match.awayScore === undefined) return false;
  ```
  `false` înseamnă **pierdere**, nu void. În `settlePendingBets`, un `false` activează
  `anyLost = true` (`:210-212`) → `LOST` (`:215-225`).
- **Exact scenario:**
  1. Adminul deschide pagina „Meciuri" și face match pe un meci nou, doar pentru a-l scoate din
     listă. `updateScoreSchema` (env.ts:75) are `status: z.enum([...]).optional().default('FINISHED')` —
     statusul implicit e `FINISHED`, iar frontend-ul (`Admin.tsx:155-159`) trimite explicit
     `status: 'FINISHED'`.
  2. `updateScoreSchema` **exige** `homeScore` și `awayScore` (ambele `z.number().int().min(0)`),
     deci prin acest endpoint scorul există întotdeauna. Dar `syncMatches` (`match.service.ts:96-104`)
     scrie `status: match.status` și `homeScore: match.homeScore` **independent** — feed-ul poate
     returna `FINISHED` cu `score.fullTime` absent, caz în care `homeScore` rămâne `null`.
  3. La următoarea rulare a cron-ului, meciul e `FINISHED`, ambele scoruri `null` →
     `checkSelectionWon` → `false` pentru **fiecare** selecție → `anyLost` → **`LOST`**.
  4. Toate pariile pe acel meci pierd creditele, definitiv și ireversibil.
- **Note de severitate:** severitatea depinde de dacă feed-ul poate produce `FINISHED` fără scor.
  **NECONFIRMAT — necesită verificare/test.** Dar defectul de *design* este neechivoc: un meci
  terminat fără scor de informație nu poate fi tratat ca o înfrângere a jucătorului, iar ramura
  există doar ca efect secundar al unui `return false` folosit drept "early return defensiv".
- **Impact:** pierdere totală de credite pentru utilizatorii afectați; nicio cale de recuperare
  (betul nu mai e `PENDING`, deci nici `cancel()` nu mai funcționează).
- **Recommended fix:** întoarce `null` (void) în loc de `false` în cele două garde de scor:
  ```ts
  if (match.homeScore == null || match.awayScore == null) return null; // void, nu pierdere
  ```
  Astfel, `settlePendingBets` activează `anyVoid` (`:196-203`) și, dacă toate selecțiile sunt
  void și meciul e `FINISHED`, ramura de refund (`:229-242`) returnează creditele.

---

## 3. HIGH

### [HIGH] `settlePendingBets()` procesează toate pariile într-o singură tranzacție cu timeout de 5 s

- **File:** `apps/api/src/services/bet.service.ts`
- **Function:** `settlePendingBets()`
- **Lines:** 163–258 (un singur `prisma.$transaction` înconjoară bucla `for` de pe liniile 172–257)
- **Problem:** Tranzacția interactivă Prisma are un timeout implicit de **5000 ms** și
  `maxWait` implicit de 2000 ms (confirmat în clientul generat,
  `node_modules/.prisma/client/index.d.ts:1346-1347`). Niciunul dintre cele trei apeluri
  `$transaction` din proiect (`bet.service.ts:62`, `:143`, `:163`) pasează un obiect `options`
  cu `timeout`/`maxWait` — am verificat: `grep -rn "timeout:\|maxWait:" apps/api/src/` nu
  returnează nimic.
- **Exact scenario:** utilizatorul are 500 de pari `PENDING`. Bucla execută, per pariu, 1
  `findMany`-am de selecții, plus câte un `betSelection.update` per selecție, plus un
  `bet.updateMany`, un `user.update` și un `notification.create`. La ~5 ms per query pe o
  conexiune locală, ~3 500 query-uri depășesc 5 s. La timeout, Prisma emite un rollback.
- **Interleaving / efect:**
  1. Tranzacția A începe, procesează 200 de pari cu succes.
  2. La ~5 s, Prisma face ROLLBACK al întregii tranzacții.
  3. **Toate cele 200 de decontări dispar** — statusurile `WON`/`LOST` revin la `PENDING`,
     incrementările de `balance` se anulează, `updateStats` se anulează, notificările se anulează.
  4. Cron-ul rulează din nou peste aceleași 500 de pari → același timeout → buclă infinită.
  5. Net: **nicio pariu nu se decontează vreodată**, iar adminul care apasă „⚡ Liquidar Apostas"
     primește `500` cu `{ error: 'Erro interno' }` (`bet.routes.ts:75-77`).
- **Impact:** indisponibilitate totală a lichidării odată ce volumul crește. Nu e pierdere
  directă de bani, dar e un **hard fail** pe calea care plătește jucătorii. Agravant: lock-ul
  `settleRunning` (`settlement-lock.ts`) rămâne `true` până în `finally` (`bet.routes.ts:78-80`),
  deci un admin vede `409 Already running` dacă o cerere blocată nu se închide.
- **Recomandare separată:** implementează idempotență la nivel de lot, nu de tranzacție.
  **Recommended fix:** închide tranzacția per pariu (sau per lot de N), și pasează opțiuni
  explicite: `prisma.$transaction(fn, { maxWait: 10_000, timeout: 30_000 })`. Lăsarea
  tranzacției deschise cât timp crește e cea mai probabilă cauză de deadlock/lungire în
  PostgreSQL, deoarece ține lock-uri de rând pe `bets` pe toată durata.

### [HIGH] `updateStats()` — pierdere de actualizare (read-modify-write) pe statistici

- **File:** `apps/api/src/services/user.service.ts`
- **Function:** `updateStats()`
- **Lines:** 78–110 (mai ales 81–87 și 101–108)
- **Problem:** Funcția citește utilizatorul (`:81`), calculează în JS
  `newBetsCount = user.betsCount + 1` și `newProfit = currentProfit + profit` (`:84-87`), apoi
  scrie valori **absolute** cu `client.user.update` (`:101-108`). Nu există
  `{ increment: ... }` și nu există comparație de versiune. Cea mai recentă scriere câștigă.
- **Exact scenario:** utilizatorul are 2 pari PENDING care se decontează în aceeași rulare a
  lui `settlePendingBets`. Bucla procesează secvențial în aceeași tranzacție, deci acest caz
  particular e salvat de izolarea tranzacției. Dar în scenariul de **două procese** de
  lichidare (vezi §7, scenariul C — posibil pe Vercel unde fiecare invocare e o funcție
  separată) sau dacă un admin apasă simultan butonul de settle în două tab-uri pe procese
  diferite, ambele tranzacții citesc `betsCount = 2` înainte ca alta să scrie, și ambele scriu
  `betsCount = 3`. Se pierde un increment.
- **Impact:** `betsCount`, `betsWon`, `profit` și `roi` subraportate. Nu produce pierdere de
  bani (balance-ul e modificat separat, cu `{increment}`, atomic), dar produce **statistici
  greșite** — unul dintre obiectivele explicite ale auditului.
- **Succes verificat:** `betsWon` **nu** se pierde în același mod, deoarece
  `betsWon ? user.betsWon + 1 : user.betsWon` recalculează din valoarea citită — o dublare
  ar necesita ca ambele tranzacții să câștige simultan, ceea ce e imposibil ca ambele să fie
  `true`; dar o **pierdere** rămâne posibilă. Și `profit` se pierde similar.
- **Recommended fix:** înlocuiește citirea+scrierea cu incrementi atomice:
  ```ts
  await client.user.update({ where: { id: userId }, data: {
    betsCount: { increment: 1 },
    ...(won ? { betsWon: { increment: 1 } } : {}),
    profit: { increment: profit },
  }});
  ```
  Pentru `roi`, fie recalculează-l dintr-un agregat, fie acceptă imprecizia (e o valoare
  derivată, nu o sursă de adevăr).

### [HIGH] `getById(betId, userId)` — verifică rolul apelantului, nu al proprietarului

- **File:** `apps/api/src/services/bet.service.ts`
- **Function:** `getById()`
- **Lines:** 126–140 (logica la 135–138)
- **Problem:**
  ```ts
  if (userId && bet.userId !== userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.role !== 'ADMIN') throw new Error('Not your bet');
  }
  ```
  Când `bet.userId !== userId`, codul verifică dacă **apelantul** (`userId`) e admin. Nu
  verifică nimic despre proprietar. Comportamentul rezultat e corect *accidental* pentru
  non-admin (aruncă), dar logica e inversată față de intenția declarativă și **nu e auditabilă**.
- **Impact:**
  - **Nu e IDOR exploatabil**: un user normal nu poate citi un bet al altuia, pentru că
    `user?.role !== 'ADMIN'` e adevărat → aruncă.
  - **Dar**: `(a)` endpoint-ul nu distinge între „bet inexistent" și „bet al altuia" — ambele
    returnează `404` (bet.routes.ts:50-53), deci nu se filtrează informație, ceea ce e corect.
  - **Real issue**: un token cu `userId` valid dar rolul schimbat între emisiune și utilizare
    ar fi evaluat corect aici (re-query la DB), deci e chiar mai robust decât ar fi cu JWT claim.
  - **Confuzie de întreținere**: logica sugerează că owner-ul poate fi admin, când de fapt
    checks rolul caller-ului. Un viitor refactor care inversează variabilele ar introduce un IDOR.
- **Recommended fix:** redenumește variabilele pentru lizibilitate și explică intentia:
  ```ts
  const requesterId = userId;
  if (bet.userId !== requesterId) {
    const requester = await prisma.user.findUnique({ where: { id: requesterId }, select: { role: true } });
    if (requester?.role !== 'ADMIN') throw new Error('Not your bet');
  }
  ```

### [HIGH] `placeBet` — race window între verificarea de match/odds și debit (odds "desincronizate")

- **File:** `apps/api/src/services/bet.service.ts`
- **Function:** `placeBet()`
- **Lines:** 30–57 (match/odds lookup **în afara tranzacției**), 62–91 (tranzacția)
- **Problem:** Citirile de `match`, `matchDate` și `odds` (`:31-41`) se fac pe `prisma` global,
  **în afara** tranzacției. Doar debitul și crearea pari sunt în tranzacție. Astfel, între
  citire și debit, un admin poate: (a) șterge meciul, (b) schimba statusul lui în
  `LIVE`/`FINISHED` prin `PATCH /:id/score`, sau (c) rescrie cotele prin `POST /sync-odds`.
- **Exact scenario:**
  1. Utilizatorul trimite `POST /bets` cu meciul `M` (status `SCHEDULED`, `matchDate` în viitor).
  2. `placeBet` citește `match` → `SCHEDULED`, trece verificările (`:33-37`).
  3. `placeBet` citește `dbOdd` → `1.90` (`:39-41`).
  4. **Adminul** apelează `PATCH /matches/M/score` cu scor, punând `M` în `FINISHED`.
  5. `placeBet` continuă: deschide tranzacția, debitează `stake`, creează `Bet` pe un meci
     deja terminat.
- **Impact:**
  - **Bets pe meciuri deja terminate** — utilizatorul pierde instant (decontat ca `LOST` la
    următoarea lichidare).
  - **Nu produce overdraft sau double-debit** — partea de bani (`:62-91`) e corectă (§7).
  - Odds-ul capturat (`:48`) e snapshot-ul de la momentul citirii; dacă adminul rescrie cotele
    între pasul 3 și 4, paria e plasată la **cota veche**, ceea ce poate da un payout mai mare
    decât piețea curentă. (Bug de business, nu de corectitudine.)
- **Mitigare existentă, insuficientă:** `applyScrapedOdds` face `deleteMany` + `createMany` pe
  cote (`match.service.ts:361-383`) — deci între cele două operații, `placeBet`'s
  `findFirst` pe `Odds` ar putea întoarce `null` → aruncă „Odds not found" (`:42`). Corect, dar
  cu un mesaj de eroare confuz pentru utilizator.
- **Recommended fix:** mută citirile de `match` și `odds` **în interiorul** tranzacției
  (folosind `tx.match` / `tx.odds`). Sub Read Committed, asta nu blochează rândurile, dar
  garantează că debitul și pariul reflectă aceeași stare. Alternativ, re-validază statusul
  meciului cu un `tx.match.findUnique` după deschiderea tranzacției.

---

## 4. MEDIUM

### [MEDIUM] `totalOdds` rotunjit, `potentialReturn` calculat din cote nerotunjite

- **File:** `apps/api/src/services/bet.service.ts`
- **Function:** `placeBet()`
- **Lines:** 59–60 (calcul), 78–79 (stocare)
- **Problem:**
  ```ts
  const totalOdds = lockedSelections.reduce((acc, s) => acc * s.odds, 1);   // nerotunjit
  const potentialReturn = stake * totalOdds;                              // nerotunjit
  // ...
  totalOdds:       Math.round(totalOdds * 100) / 100,        // rotunjit la 2 zecimale
  potentialReturn: Math.round(potentialReturn * 100) / 100,  // rotunjit la 2 zecimale
  ```
  Cele două valori stocate **nu sunt consistente între ele**: `potentialReturn` e derivat din
  `totalOdds` nerotunjit, dar `totalOdds` stocat e rotunjit. `stake × totalOdds_stocat ≠
  potentialReturn_stocat` în general.
- **Exemple numerice concrete** (verificate rulând formula exactă din cod):
  - `stake = 10`, cote `[1.955, 1.871]`: totalOdds brut = `3.657805`; stocat `3.66`;
    `potentialReturn` stocat = `36.58`; dar `10 × 3.66 = 36.60`. **Diferență: 0.02 CR.**
  - `stake = 100`, aceleași cote: stocat `3.66`, payout stocat `365.78`, dar
    `100 × 3.66 = 366.00`. **Diferență: 0.22 CR.**
  - `stake = 10`, cote `[1.91, 1.87, 1.95]`: brut `6.964815`; stocat `6.96` (rotunjire **în
    jos**); payout stocat `69.65`; dar `10 × 6.96 = 69.60`. **Diferență: −0.05 CR.**
  - `stake = 10000`, aceleași cote: payout stocat `69648.15` vs
    `10000 × 6.96 = 69600`. **Diferență: −48.15 CR.**
- **Direcția diferenței nu e constantă** — depinde de sensul rotunjirii. La cote mari cu stake
  maxim (10000, limita din `env.ts:39`), eroarea poate depăși zeci de credite. Cumulată pe un
  volum mare, devine o problemă reală de contabilitate.
- **Impact:**
  - **Cifre afișate ≠ cifre plătite.** Ecranul afișează `bet.totalOdds` (rotunjit, din
    `Bets.tsx:204`) și `bet.potentialReturn` (din `Bets.tsx:205`), iar payoutul se execută pe
    `bet.potentialReturn` (`bet.service.ts:253`). Așadar, utilizatorul vede `3.66` și `36.58`,
    dar relația `10 × 3.66 = 36.60` nu se verifică.
  - **Impact real asupra banilor: zero.** Payout-ul folosește `potentialReturn` stocat, care
    e valoarea reală. Deci **nu** apare plată greșită — apare **inconsistență de afișare**.
  - **Statistici:** `profit = potentialReturn − stake` (`:244`) folosește aceeași valoare
    stocată, deci e intern consistent. ROI-ul e derivat din profit, deci consistent.
- **Severitate reală:** MEDIUM, nu CRITICAL — nu produce pierdere de bani, ci incoerență
  între ce se afișează și relația matematică prezentată. Dar într-un produs cu „credite
  virtuale" în care încrederea în cifre e esențială, e un defect vizibil.
- **Recommended fix:** alege o singură regulă și aplic-o ambelor câmpuri. Cel mai simplu:
  ```ts
  const totalOdds = Math.round(raw * 100) / 100;
  const potentialReturn = Math.round(stake * totalOdds * 100) / 100;  // din totalOdds ROTUNJIT
  ```
  Astfel `stake × totalOdds === potentialReturn` (la precizia stocată) devine invariant.
  Alternativ, folosește `Prisma.Decimal` pentru întregul lanț și rotunjește o singură dată, la
  granița de afișare.

### [MEDIUM] `betsCount` include pariile anulate manual → statistici și „Derrotas" greșite

- **File:** `apps/api/src/services/user.service.ts` + `apps/web/src/pages/Dashboard.tsx`
- **Function:** `updateStats()` / `Dashboard`
- **Lines:** `user.service.ts:84` (betsCount+1 apelat doar din settle), `Dashboard.tsx:127`
- **Problem:** `updateStats` e apelat **doar** din `settlePendingBets`, la tranzițiile
  `LOST` (`:222`) și `WON` (`:255`) — nicăieri pe `CANCELLED`. Deci `betsCount` crește doar
  la decontare, ceea ce e corect. Dar `Dashboard.tsx:127` calculează:
  ```ts
  {(user?.betsCount || 0) - (user?.betsWon || 0)}   // "Derrotas"
  ```
  `betsCount - betsWon` = pierderi + **pariile încă ne-decontate nu intră**, dar orice
  logică viitoare care ar include `CANCELLED` în `betsCount` ar face ca „Derrotas" să numere
  și anulări. **În implementarea curentă**, `CANCELLED` nu intră în `betsCount`, deci expresia
  e **corectă pentru WON/LOST**. Marcat ca MEDIUM pentru că:
  - e o **inferență fragilă**: expresia presupune o proprietate a schemei de status care nu e
    declarată explicit niciunde și nici testată.
  - **Dacă cineva fixează `betsCount` să numere toate pariile plasate** (o interpretare
    rezonabilă a denumirii), „Derrotas" va număra automat anulările ca înfrângeri.
- **Impact:** în prezent, **zero** impact. Impact **potențial** la orice schimbare viitoare.
- **Recommended fix:** fie numește explicit `betsSettled`, fie calculează „Derrotas" din
  statisticile reale. Alternativ, adaugă un câmp `betsLost` la `User`, incrementat
  simetric cu `betsWon` (atomic), și afișează `user.betsLost` direct.

### [MEDIUM] Notificarea `BET_CREATED` e trimisă în afara tranzacției

- **File:** `apps/api/src/services/bet.service.ts`
- **Function:** `placeBet()`
- **Lines:** 93
- **Problem:**
  ```ts
  await notificationService.create(userId, 'BET_CREATED',
    `Aposta de ${stake} CR colocada @ ${totalOdds.toFixed(2)}`);
  ```
  E apelată **după** `prisma.$transaction` (`:62-91`) și **fără** argumentul `tx`. Deci e o
  operație separată, care poate eșua independent de pari.
- **Observație corectată:** `totalOdds` aici e variabila **nerotunjită** (`:59`), dar
  `.toFixed(2)` o rotunjește **la afișare**, deci mesajul coincide cu valoarea stocată.
  **Nu e discrepanță numerică** aici — doar o coincidență a rotunjirii.
- **Impact real:** o notificare poate lipsi dacă procesul moare între cele două apeluri, sau
  poate exista notificare fără pariu într-o fereastră foarte mică. Fără impact pe bani.
- **Contrast cu settlement:** toate notificările din `settlePendingBets` (`:223`, `:240`,
  `:256`) **primesc `tx`** și deci sunt atomice cu decontarea. Deci §8 (Notifications) e
  **corect** — excepția e doar `placeBet`.
- **Recommended fix:** pentru consistență, fie acceptă explicit că `BET_CREATED` e
  best-effort (și documentează), fie muță în tranzacție. Recomandarea: **lasă în afara**,
  pentru că o notificare e non-critică și nu ar trebui să țină blocată tranzacția banilor.
  Adaugă un comentariu care s-o declare.

### [MEDIUM] Rate limit global (200/15 min) poate bloca lichidarea

- **File:** `apps/api/src/index.ts`
- **Lines:** 37–42
- **Problem:** `app.use('/api/', limiter)` cu `max: 200` pe 15 minute se aplică și la
  `/api/cron/settle` și `/api/bets/settle`. Cronul extern (ex. crontab) care lovește endpoint-ul
  la fiecare 5 minute consumă din același buget ca și utilizatorii.
- **Impact:** într-o instanță cu utilizatori activi, endpoint-urile de lichidare pot primi
  `429 Too Many requests`, lăsând pari `PENDING` nedecontate. Combinat cu HIGH §3.1 (timeout
  tranzacție), creează o fereastră în care pari stau neplătite.
- **Recommended fix:** aplică `limiter` pe `/api/bets` și `/api/matches` (rutele de utilizator),
  dar **nu** pe `/api/cron/*`. Alternativ, folosește limitere separate pentru rute admin/cron.

### [MEDIUM] `placeBet` acceptă stake fracționar → inconsecvență între starea stocată și calcul

- **File:** `apps/api/src/config/env.ts` + `bet.service.ts`
- **Lines:** `env.ts:38-45`, `bet.service.ts:60`, `bet.service.ts:82`
- **Problem:** `placeBetSchema` acceptă `z.number().min(1).max(10000)` — **admite fracții**.
  `stake = 10.005` trece validarea. `potentialReturn = stake × totalOdds` (`:60`) se calculează
  cu valoarea **nerotunjită**, dar `stake` (`:82`) se stochează într-o coloană `Decimal(10,2)`,
  unde Postgres îl forțează la 2 zecimale.
- **Impact:** `stake` stocat ≠ valoarea folosită la calculul payout-ului. Diferențe de sub un
  cent. **NECONFIRMAT — necesită verificare/test** (comportamentul exact al driverului
  Prisma/Postgres pentru `Decimal(10,2)` la o valoare cu precizie excesivă; Docker nu e
  disponibil în mediul de audit, deci n-am putut executa un test real).
- **Recommended fix:** forează stake-ul la 2 zecimale la intrare:
  `stake: z.number().min(1).max(10000).multipleOf(0.01)`. Sau normalizează cu
  `Math.round(stake*100)/100` **imediat după** validare, înainte de orice calcul.

---

## 5. LOW

### [LOW] `userService.updateBalance()` este cod mort

- **File:** `apps/api/src/services/user.service.ts`
- **Lines:** 70–76
- **Problem:** Funcția incrementează balanța unui utilizator fără nicio verificare. Nu e
  apelată de nicăieri — verificat prin `grep -rn "updateBalance" apps/`: singurele apariții
  sunt definiția, fără utilizare. `admin.service.updateUser` folosește un `update` direct cu
  `balance` (absolut, validat 0–1 000 000).
- **Impact:** zero acum. Dar e o funcție publică de pe obiectul `userService` care ar putea fi
  apelată în viitor dintr-un endpoint nou, ocolind toate verificările.
- **Recommended fix:** elimină funcția. Nu e nevoie de ea — adminul are deja `updateUser`.

### [LOW] Mesaj de eroare greșit pe ruta de cancel

- **File:** `apps/api/src/routes/bet.routes.ts`
- **Lines:** 60–63
- **Problem:** `router.post('/:id/cancel')` întoarce `{ error: 'Erro ao colocar aposta' }` la
  orice eșec — inclusiv „Not your bet", „Can only cancel pending bets", „Bet not found".
- **Impact:** confuzie pentru utilizator și pentru depanare. Un utilizator care încearcă să
  anuleze o pariu deja câștigată primește „Eroare la plasarea pariului".
- **Recommended fix:** distinge mesajele: „Anulează doar pariile în așteptare" pentru status,
  „Aposta nu a fost găsită" pentru lipsă. Codul 400 e corect pentru toate.

### [LOW] `listByUser` — index lipsă pentru paginarea pe cursor

- **File:** `apps/api/src/services/bet.service.ts` + `prisma/schema.prisma`
- **Lines:** `bet.service.ts:98-124`; `schema.prisma:116-117`
- **Problem:** Paginarea folosește `cursor: { id }` + `orderBy: { createdAt: 'desc' }`
  (`:102-110`). Corectitudine — corectă. Performanță — există `@@index([userId])` dar nu
  `@@index([userId, createdAt])`, deci Postgres poate sorta în memorie la volume mari.
- **Recommended fix:** opțional, adaugă `@@index([userId, createdAt])`.

### [LOW] `RESULTADO_CORRETO` — cote limitate la 9 scoruri în generarea estimată

- **File:** `apps/api/src/services/match.service.ts`
- **Lines:** 271
- **Problem:** `generateOdds` creează cote doar pentru `['1-0','2-0','2-1','0-0','1-1','2-2',
  '0-1','0-2','1-2']`. `checkSelectionWon` (`:305-308`) tratează corect orice scor, dar cote nu
  există pentru scoruri mai mari. Jocurile cu scor mare (ex. 3-2) nu au piață de scor corect.
- **Impact:** limitare de acoperire, nu de corectitudine. Cote reale din `odds.json` au scoruri
  mai ample (până la 4-1).
- **Recommended fix:** extinde lista de scoruri estimate sau folosește o distribuție Poisson
  (deja există `odds_engine.py` care o implementează).

### [LOW] `HANDICAP_0_0` returnează `null` (push) — corect, dar netestat

- **File:** `apps/api/src/services/bet.service.ts`
- **Lines:** 326–327
- **Problem:** `case 'HANDICAP_0_0': return null;` — handicapul 0 este un „push" în semnificația
  corectă a pieței de handicap (egalitatea dă refund, nu câștig/pierdere). Returnează `null`
  (void) → corect. Dar **nu e acoperit de niciun test** (vezi §11).
- **Impact:** niciunul acum — logica e corectă. Dar o refacere viitoare ar putea s-o
  înrăutățească fără ca un test să o prindă.
- **Recommended fix:** adaugă test unitar pentru `HANDICAP_0_0` (vezi §11).

---

## 6. VERIFIED CORRECT

Lista de verificări care au trecut. Acestea sunt importante: înseamnă că auditul acoperă și
zonele unde codul e corect, nu doar problemele.

### 6.1 Integritatea banilor — fluxul principal

1. **Debitul la plasare e un compare-and-swap atomic.**
   `bet.service.ts:69-72`:
   ```ts
   await tx.user.update({ where: { id: userId, balance: { gte: stake } },
                          data: { balance: { decrement: stake } } });
   ```
   Filtrarea `balance >= stake` e aplicată **în aceeași declarație SQL** cu decrementul. Prisma
   compilează `extendedWhereUnique` (GA din Prisma 5 — confirmat: proiectul rulează 5.22.0, iar
   tipul generat `UserWhereUniqueInput` include `balance?: DecimalFilter<"User">`, vezi
   `node_modules/.prisma/client/index.d.ts:10089-10109`). Postgres aplică
   `UPDATE ... WHERE id = $1 AND balance >= $2`, deci **lock-ul de rând** face ca o a doua
   tranzacție concurentă să fie evaluată **după** ce prima a făcut commit. Dacă soldul nu mai
   ajunge, rândul nu se potrivește și Prisma aruncă `P2025` → tranzacția se rollbackează.
   **Verdict: corect. Overdraft-ul e imposibil în single-process.**

2. **Verificarea prealabilă a soldului e corectă dar redundantă.**
   `bet.service.ts:67`: `if (Number(user.balance) < stake) throw ...`. E doar pentru mesajul de
   eroare — garanția reală e filtrul atomic de la punctul 1. **Fără TOCTOU.**

3. **Refund-ul la cancel este protejat de status.**
   `bet.service.ts:142-161`: citește betul, verifică `bet.userId !== userId` → throw, verifică
   `bet.status !== 'PENDING'` → throw, **abia apoi** incrementează. Statusul e citit în
   aceeași tranzacție cu scrierea, deci un al doilea `cancel()` care rulează după commit-ul
   primului va citi `status = 'CANCELLED'` și va arunca. **Verdict: corect.**

4. **Payout-ul la WON e protejat de `updateMany` cu guard de status.**
   `bet.service.ts:245-249`:
   ```ts
   const won = await tx.bet.updateMany({ where: { id: bet.id, status: 'PENDING' },
                                          data: { status: 'WON', ... } });
   if (won.count !== 1) continue;   // <-- garda
   await tx.user.update({ data: { balance: { increment: bet.potentialReturn } } });
   ```
   Incrementul de balance apare **după** ce garda a confirmat `count === 1`. Sub Read Committed,
   o a doua rulare de settlement va re-evalua `WHERE status = 'PENDING'` după așteptarea
   lock-ului de rând și va obține `count = 0` → `continue` → **niciun payout**. **Verdict:
   corect — double payout e exclus.**

5. **Refund-ul la void/CANCELLED e protejat identic.**
   `bet.service.ts:230-234`, exact același tipar. **Verdict: corect.**

6. **Tranziția LOST e protejată la fel.** `bet.service.ts:216-220`. **Verdict: corect.**

7. **Cotele sunt luate din BD, nu din payload-ul clientului.**
   `bet.service.ts:39-49`: `prisma.odds.findFirst(...)` și `lockedSelections.push({ odds:
   Number(dbOdd.value) })`. `lockedSelections` e construit **doar** din valori citate din BD;
   obiectul `s.odds` din request e **ignorat** complet. **Verdict: corect — clientul nu poate
   manipula cotele.** (Observație: frontend-ul trimite `odds` în payload
   `BetSlip.tsx:23`, dar e explicit ignorat. Telemetrie inutilă, nu risc.)

8. **Verificarea statusului meciului e prezentă** la `:33` (`match.status !== 'SCHEDULED'`) și
   a orei de start la `:35-37`. **Verdict: corect** (cu observația din HIGH §3.4 despre fereastra
   dintre verificare și debit).

9. **Pariile sunt limitate ca număr** (`:26-27`, max 20 selecții) și **stake-ul e limitat**
   (`env.ts:39`, max 10000). **Verdict: corect.**

10. **Duplicatele pe același meci+piață sunt respinse** (`:52-57`). **Verdict: corect.**

11. **Toate notificările de settlement sunt în aceeași tranzacție ca decontarea** și primesc
    `tx` explicit (`:223`, `:240`, `:256`). `notificationService.create` folosește
    `const client = tx ?? prisma` (`:6`) — corect, nu cade accidental pe clientul global.
    **Verdict: corect.** (Excepție: `placeBet`, vezi MEDIUM §4.)

12. **`updateStats` rulează în aceeași tranzacție.** Ambele apeluri din `settlePendingBets` (`:222`,
    `:255`) pasează `tx` ca al 5-lea argument. **Verdict: corect** — deci o eroare în stats
    rollbackează și decontarea, păstrând consistența.

13. **Lipsa scorului din `RESULTADO_INTERVALO` e tratată corect ca void**, nu ca pierdere
    (`:313-314` returnează `null`). Comentariul din cod (`:311-312`) explică corect motivul.
    **Verdict: corect** — contrast puternic cu CRITICAL §2.2, unde garda de scor *lipsă* e
    tratată ca pierdere. Inconsistență în aceeași funcție.

14. **`HANDICAP_0_0` returnează `null`** (push) — semantică corectă. **Verdict: corect**
    (netestat — LOW §5.5).

15. **`applyScrapedOdds` re-scrie cotele cu `deleteMany` + `createMany`** (`match.service.ts:361-383`).
    Între cele două operații, un `placeBet` concurrent poate primi `Odds not found` — deci
    **fereastra e închisă cu un throw**, nu cu o plasare pe cote șterse. **Verdict: corect.**

16. **`requireAdmin` revalidează rolul în BD**, nu din claim-ul JWT (`auth.ts:32-40`), și
    verifică și `isBlocked`. **Verdict: corect** — defensiv împotriva tokenurilor cu rol învechit.

17. **Variabilele de mediu critice se verifică la pornire** (`env.ts:5-7`): lipsa lui
    `JWT_SECRET` sau `CRON_SECRET` arunca, împiedicând un bypass cu secret gol. **Verdict:
    corect.**

18. **Rutele cron resping un header gol** (`index.ts:57`, `:74`: `if (!provided || provided !== ...)`).
    **Verdict: corect** — altfel un header Bearer gol ar putea coincide cu un `CRON_SECRET` gol.

19. **IDOR pe pari — corect, cu observație de lizibilitate.** `getById` (:135-138),
    `cancel` (:146), `listByUser` (:99). Un utilizator normal nu poate citi/anula/modifica
    pari ale altuia. **Verdict: corect** (vezi HIGH §3.3 pentru problema de lizibilitate, nu de
    securitate).

20. **`adminService.deleteUser` protejează utilizatorii ADMIN** (`:72`), iar `updateUser` împiedică
    blocarea lor (`:57-59`). **Verdict: corect.**

21. **`deleteMatch` refuză ștergerea unui meci cu pari pe el** (`match.service.ts:248-254`),
    deci istoricul decontat nu poate fi orfanat. **Verdict: corect.**

22. **Normalizarea Decimal → Number e făcută consecvent la frontiera API**: `mapBet`
    (`bet.service.ts:9-17`), `mapOdds` (`match.service.ts:14-15`), `userService.getProfile`
    (`:25-27`), `adminService.listUsers` (`:30-32`), `rankingService` (`:20-22`),
    `groupService.mapMemberBalance` (`:15-17`). **Verdict: corect** — `.toFixed()` din
    frontend nu va crasha.

23. **Formulele de piață verificate manual** (non-handicap) sunt **corecte**:
    - `1X2` (`:277-281`): `home > away` / `home === away` / `away > home` — corect.
    - `DUPLA_HIPOTESE` (`:283-287`): `1X = home >= away`, `X2 = away >= home`,
      `12 = home !== away` — corect, include egalitatea exact cum trebuie.
    - `AMBAS_MARCAM` (`:300-303`): `Sim = home > 0 && away > 0`, `Não = home === 0 ||
      away === 0` — corect, `Não` e complementul exact al lui `Sim`.
    - `RESULTADO_CORRETO` (`:305-308`): compară `home-away` — corect.
    - `IMPAR_PAR` (`:335-336`): `total % 2` — corect.
    - `MARCAS_x_5` (`:289-298`): `total > x.5` / `total < x.5` — **formulele sunt corecte**;
      problema e doar ramura `else` care tratează selecțiile ne-cunoscute ca „sub" (vezi
      CRITICAL §2.1).
    - `GOLOS_0..6` (`:338-347`): `parseInt(market.split('_').pop())` și `total === expected` —
      corect.
    **Verdict: corect, cu excepția ramurilor de selecție invalidă și a handicapurilor.**

24. **Testele existente trec**: API 35/35, Web 3/3. **Verdict: verde** (dar acoperirea e
   structural insuficientă — vezi §11).

---

## 7. CONCURRENCY ANALYSIS

Analiza celor șase scenarii cerute. Notă preliminară: izolarea implicită Prisma pentru
PostgreSQL este **Read Committed**, iar `isolationLevel` nu e setat nicăieri
(`grep -rn "isolationLevel" apps/api/src/` → niciun rezultat).

### SCENARIUL A — Două `cancel()` simultane pe același bet

- **Ce citește Tx A:** `tx.bet.findUnique({id})` → `{status: 'PENDING', stake: 50}`.
- **Ce citește Tx B:** identic — `{status: 'PENDING', stake: 50}`.
- **Ce UPDATE execută ambele:** `tx.user.update({ where: {id: userId}, data: {balance:
  {increment: 50}} })` (:149-152), apoi `tx.bet.update({ where: {id: betId}, data:
  {status: 'CANCELLED'}})` (:154-157).
- **Este UPDATE-ul de status condiționat?** **NU.** `tx.bet.update` are `where: { id: betId }`
  — **doar id, fără `status: 'PENDING'`**.
- **Interleaving pas cu pas:**
  1. Tx A citește betul: `status = 'PENDING'`. Validările trec.
  2. Tx A execută `user.update` (increment 50). Postgres ia lock de rând pe `users`.
     Tx A deține lock-ul. **Tx B e blocată pe același rând** (`users.id = userId`).
  3. Tx B a citit deja `status = 'PENDING'` (pasul 1 al ei), apoi **blochează** la
     `user.update` — deci B nu a ajuns încă la `bet.update`.
  4. Tx A face `bet.update` → `CANCELLED`, apoi COMMIT. Eliberează lock-ul pe `users`.
  5. Tx B se deblocchează, execută `user.update` → **+50 credit**. Apoi execută
     `bet.update` → `CANCELLED` (idempotent, scrie aceeași valoare). COMMIT.
- **Verdict: **NU** — double refund imposibil, datorită **serializării pe rândul `users`**,
  nu unei interogări condiționate. Cea de-a doua tranzacție blochează pe increment și, când
  se deblocchează, rescrie doar aceeași stare. Suma finală: **+50, corect.**
- **De ce e norocos, nu prin design:** garda reală e lock-ul de rând pe `users`, un efect
  secundar al faptului că ambele tranzacții ating același utilizator. Dacă `cancel` ar face
  *mai întâi* `bet.update` și *apoi* incrementul, ordinea s-ar inversa și ar fi tot corect.
  Totuși, corectitudinea depinde de existența rândului `users` — o garză implicită, fragilă
  la refactor. **`bet.update` necondiționat e un avertisment de întreținere.**
- **Margine unde ar apărea bug-ul:** dacă `cancel` ar fi implementat ca
  `bet.update(where: {id, status:'PENDING'})` **urmat** de un increment pe baza unui
  `stake` citit în afara tranzacției, atunci o eroare la increment ar lăsa pariul marcat
  `CANCELLED` fără refund. Implementarea curentă evită asta pentru că incrementul precedă
  schimbarea de status.

### SCENARIUL B — `cancel()` și settlement simultan pe același bet

- **Ce citește Tx A (cancel):** `{status: 'PENDING', stake: 50}`.
- **Ce citește Tx B (settle):** `tx.bet.findMany({where: {status: 'PENDING'}})` → include
  același bet, cu `status: 'PENDING'`.
- **Ce UPDATE execută:**
  - A: `user.update` increment 50 (:149) → `bet.update` status `CANCELLED` (:154).
  - B: calculează `won` per selecție, apoi `bet.updateMany({where: {id, status:'PENDING'}})`
    → `WON` (:245) sau `LOST` (:216) sau `CANCELLED` (:230), **fiecare urmat de `if
    (count !== 1) continue`**.
- **Este UPDATE-ul condiționat de status?** **Parțial.** `cancel` **nu**; settlement **da** (cele
  trei `updateMany` au toate `status: 'PENDING'` în `where`).
- **Interleaving (cazul periculos — cancel câștigă cursa):**
  1. B (settle) citește lista de pari `PENDING` — betul e acolo.
  2. B începe evaluarea selecțiilor.
  3. A (cancel) citește `status = 'PENDING'`, incrementează +50, face `bet.update` →
     `CANCELLED`, **COMMIT**.
  4. B ajunge la `bet.updateMany({where: {id, status: 'PENDING'}})`.
  5. Postgres re-evaluează `WHERE` **după** așteptarea lock-ului de rând (read committed):
     statusul e acum `CANCELLED`, deci `count = 0`.
  6. B: `if (won.count !== 1) continue` (:249) → **nu plătește**. **Corect.**
- **Interleaving (cazul invers — settle câștigă cursa):**
  1. B face `bet.updateMany` → `WON`, apoi `user.update` increment `potentialReturn` (:251-254),
     COMMIT.
  2. A (cancel) citește `status` — **depinde de momentul citirii**:
     - Dacă A a citit **înainte** de commit-ul lui B: are `PENDING` în cache-ul său. Apoi A
       incrementează +50 și face `bet.update` → scrie `CANCELLED` **peste** `WON`!
     - **Aici apare problema reală:** `bet.update` la :154-157 e **necondiționat**.
- **Verdict: există un defect, dar e limitat.** Dacă `cancel` și `settle` rulează truly
  concurrent pe aceeași tranzacție, `cancel` poate suprascrie `WON` cu `CANCELLED` **și** să
  încase refund-ul, rezultând: utilizatorul primește `potentialReturn` (payout) **+** `stake`
  (refund) pentru aceeași pariu, iar pariul e marcat `CANCELLED`.
  - **Probabilitate reală: mică dar nenulă.** În single-process, lock-ul `settleRunning`
    (`settlement-lock.ts`) serializează settlement-ul, dar **nu serializează `cancel`** — un
    `cancel` poate rula în timp ce settlement-ul e în desfășurare. Deci race-ul e **real**, nu
    teoretic.
  - **Salvare parțială:** dacă tx A (cancel) începe *după* ce B a citit, blocarea pe
    `user.update` (ambele ating rândul `users`) poate forța serializarea. Dacă ambele
    încearcă `user.update` aproape simultan, unul blochează celălalt, iar cel care pierde cursa
    re-verifică... **dar nu**: `cancel` nu re-verifică statusul după așteptarea lock-ului. Deci
    salvarea e incidentală, nu garantată.
- **Impact:** **double credit** (payout + refund) și **status incorect** (`CANCELLED` în loc de
  `WON`) → statisticile rămân corecte (stats se calculează în tranziția de settle, care a
  commit-at), dar soldul e greșit.
- **Recommended fix:** schimbă `cancel` să folosească același tipar de gardă:
  ```ts
  const flipped = await tx.bet.updateMany({
    where: { id: betId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
  if (flipped.count !== 1) throw new Error('Can only cancel pending bets');
  await tx.user.update({ where: { id: userId }, data: { balance: { increment: bet.stake } } });
  ```
  **Important:** inversarea ordinii (status **înainte** de increment) e cea corectă aici, pentru
  că `updateMany` e singurul prim punct de serializare. Alternativ, păstrează ordinea curentă
  dar adaugă un `updateMany` cu gardă **înainte** de increment.

### SCENARIUL C — Două `settlePendingBets()` simultane

- **Ce citește Tx A:** `tx.bet.findMany({where: {status: 'PENDING'}})` (:164-170).
- **Ce citește Tx B:** identic — **aceeași mulțime de pari**.
- **Ce UPDATE execută:** pentru fiecare bet, cele trei `updateMany` cu
  `where: {id, status: 'PENDING'}` (:216, :230, :245).
- **Este UPDATE-ul condiționat de status?** **DA — toate trei.**
- **Interleaving:**
  1. A și B citesc aceeași listă de pari `PENDING` (izolat, înainte de orice write).
  2. A procesează betul #1: `updateMany` → `count = 1` → plătește → merge la betul #2.
  3. B procesează betul #1: `updateMany({where: {id, status:'PENDING'}})` — statusul e acum
     `WON` (commit-at sau în-lock de A) → `count = 0` → `if (count !== 1) continue` (:249)
     → **B sare peste tot restul logicii pentru acest bet: nu plătește, nu actualizează
     stats, nu notifică.**
  4. La fel pentru fiecare bet.
- **Verdict: **NU** — double payout și double stats sunt excluse. Garda
  `count !== 1` (`:220`, `:234`, `:249`) e suficientă sub Read Committed, deoarece re-evaluarea
  post-lock a predicate-ului de rând e garantată de Postgres.
- **Probleme secundare reale:**
  - **Nu există lock cross-proces.** `settleRunning` (`settlement-lock.ts:9`) e o variabilă
    **în memorie, per proces**. Pe Vercel (unde fiecare invocare e o funcție serverless
    separată, cf. `vercel.json`), sau cu mai multe instanțe Docker, două settlement-uri
    rulează simultan fără constrângere. Garda `updateMany` le face corecte, dar ambele fac
    aceeași muncă — dublu cost.
  - **Interlocking mascat:** ambele tranzacții țin lock-uri de rând pe aceleași pari
    (`bet.updateMany`), în aceeași ordine (ambele citesc în ordinea default a DB). Ordinea
    consistentă evită deadlock-ul în cele mai multe cazuri, dar **nu e garantată** dacă
    `findMany` fără `orderBy` (:164) returnează ordine diferită în cele două tranzacții.
    **Probabilitate de deadlock: NECONFIRMAT — necesită verificare/test.** Recomandare:
    adaugă `orderBy: { id: 'asc' }` la `findMany` pentru ordine deterministă.
  - **Rollback în masă** — vezi HIGH §3.1: dacă una dintre cele două tranzacții depășește
    timeout-ul, toate scrierile sale dispar, dar nu și ale celeilalte. Deci o rulare poate
    **șterge** decontări deja efectuate de cealaltă. Combinat cu lock-ul, rezultatul e
    „pari decontate, apoi decontate iar și pierdute" — deci **pierdere de payout**, nu de
    bani.

### SCENARIUL D — Două `placeBet()` simultane pentru același utilizator

- **Ce citește Tx A:** `tx.user.findUnique({id})` (:63) → `{balance: 100, isBlocked: false}`.
- **Ce citește Tx B:** identic → `{balance: 100, ...}`.
- **Ce UPDATE execută ambele:** `tx.user.update({where: {id, balance: {gte: stake}},
  data: {balance: {decrement: stake}}})` (:69-72), apoi `tx.bet.create` (:74-90).
- **Este UPDATE-ul condiționat?** **DA — prin `balance: { gte: stake }`**, atomic cu
  decrementul.
- **Interleaving (utilizator cu 100 CR, două pari de câte 60):**
  1. A citește `balance = 100`. Trec verificările (`:67`).
  2. B citește `balance = 100`. Trec verificările (`:67`).
  3. A execută `UPDATE users SET balance = 100 - 60 WHERE id = U AND balance >= 60` → 40. Lock pe rând.
  4. B execută același UPDATE — **blochează** pe rând.
  5. A creează betul, COMMIT.
  6. B se deblocchează, re-evaluează `balance >= 60` → `40 >= 60` e fals → **0 rânduri
     actualizate** → Prisma aruncă `P2025` (`RecordNotFound`) → tranzacția se rollbackează.
  7. B primește `400 { error: ... }`. **Niciun bet creat, niciun debit.**
- **Verdict: **NU** — overdraft-ul e imposibil. Filtrarea compusă e un compare-and-swap
  corect, susținut de izolarea la nivel de rând a Postgres.
- **Observație:** verificarea de la `:67` (`if (Number(user.balance) < stake)`) folosește valoarea
  **stale** citită la început, deci poate lăsa un utilizator fără suficiente credite să treacă
  verificarea inițială — dar filtrarea atomică de la `:70` prinde cazul. **Nu e bug**, doar
  verificare redundantă.

### SCENARIUL E — Două `placeBet()` simultane, saldo suficient pentru un singur pariu

- **Identic cu Scenariul D** — e exact cazul numeric demonstrat acolo (100 CR, două pari de 60).
- **Verdict: **NU** — exact un debit reușește, al doilea e respins atomic. **Overdraft
  imposibil.** Acesta e cel mai bine protejat flux din întreaga aplicație.

### SCENARIUL F — Settlement repetat după ce betul e deja WON / LOST / CANCELLED

- **Ce citește Tx A (a doua rulare):** `tx.bet.findMany({where: {status: 'PENDING'}})` (:164)
  — **betul nu apare**, pentru că statusul nu mai e `PENDING`.
- **Ce UPDATE execută:** **niciunul** — betul nu e în listă, bucla nu îl atinge.
- **Verdict: **NU** — dublul-plata e exclusă la nivel de **selecție**, prin filtrarea
  `where: { status: 'PENDING' }` din `findMany`.
- **Dublă verificare (redundantă dar corectă):** chiar dacă un bet ar ajunge în listă (ex.
  cursă cu `cancel`), cele trei `updateMany` cu gardă de status (`:216`, `:230`, `:245`) ar
  returna `count = 0` și ar continua. **Belt-and-suspenders corect.**
- **Statisticile nu se dubledază:** `updateStats` e apelat **după** gardă (`:222`, `:255`), deci
  doar pe tranziția care a câștigat cursa.

### 7.4 Rezumat concurență

| Scenariu | Double payout? | Double refund? | Sold inconsistent? | Gardă |
|---|---|---|---|---|
| A — 2× cancel | NU | **NU** | NU | lock de rând pe `users` (implicit) |
| B — cancel + settle | **POSIBIL** (race) | **POSIBIL** | **DA** | `bet.update` necondiționat la `cancel` |
| C — 2× settle | NU | NU | NU* | `updateMany` cu `status: 'PENDING'` |
| D — 2× placeBet | NU | — | NU | `update` cu `balance: {gte}` |
| E — 2× placeBet, saldo limită | NU | — | NU | idem, atomic |
| F — settle repetat | NU | NU | NU | `findMany` + `updateMany` gardat |

\* Cu excepția pierderii totale prin rollback la timeout (HIGH §3.1), care afectează toate
scenariile de settlement.

**Singurul race condition cu impact monetar găsit este Scenariul B.**

---

## 8. MONEY / ROUNDING ANALYSIS

### 8.1 Lanțul de conversie Decimal → Number

Toate coloanele monetare sunt `@db.Decimal(10, 2)`. Prisma le întoarce ca obiecte
`Prisma.Decimal`, care se serializează în JSON ca **string** (de ex. `"36.58"`). Codul
normalizează explicit la `Number()` la frontiera:

| Locație | Ce normalizează |
|---|---|
| `bet.service.ts:9-17` (`mapBet`) | `stake`, `totalOdds`, `potentialReturn`, `selections[].odds` |
| `match.service.ts:14-15` (`mapOdds`) | `odds[].value` |
| `user.service.ts:25-27` | `balance`, `roi`, `profit` |
| `user.service.ts:49` | `balance` |
| `user.service.ts:75` | `balance` |
| `admin.service.ts:30-32`, `:46`, `:66` | `balance`, `roi`, `profit` |
| `ranking.service.ts:20-22`, `:51-54` | `balance`, `profit`, `roi` |
| `group.service.ts:15-17` | `balance`, `profit`, `roi` |

**Verdict: normalizarea e consecventă și corectă.** Am verificat toate aceste call-site-uri
individual — nu există loc unde un `Decimal` să ajungă neconversat la frontend. De aceea
`.toFixed()` din `Bets.tsx:180`, `.toFixed(2)` din `Dashboard.tsx:91` etc. nu crashează.

### 8.2 Unde se calculează în JS pe `number`

- `bet.service.ts:59` — `totalOdds` (înmulțire repetată, `number`)
- `bet.service.ts:60` — `potentialReturn = stake * totalOdds`
- `bet.service.ts:78-79` — rotunjiri cu `Math.round(x * 100) / 100`
- `bet.service.ts:244` — `profit = Number(bet.potentialReturn) - Number(bet.stake)`
- `bet.service.ts:222` — `-Number(bet.stake)`
- `user.service.ts:86-87` — `Number(user.profit) + profit`
- `user.service.ts:96-99` — agregarea stake-urilor și calculul ROI

**Floating point:** toate aceste calcule folosesc `number` (IEEE 754 double). `1.955 * 1.871`
în binar nu dă exact `3.657805`. E o sursă de eroare sub-cent, dar **rotunjirea la 2 zecimale
de la `:78-79` o absoarbe** în majoritatea cazurilor. Problema nu e floating point — e
**inconsistența dintre cele două valori rotunjite independent** (vezi §4, MEDIUM).

### 8.3 Problema centrală: `totalOdds` și `potentialReturn` rotunjite independent

Detaliat în MEDIUM §4 cu patru exemple numerice verificate. Concluzia:

- **Nicio plată greșită.** Payout-ul se calculează pe `potentialReturn` **stocat** (`:253`),
  care e valoarea efectivă și corect rotunjită.
- **Dar invariantul `stake × totalOdds === potentialReturn` e încălcat**, deci relația
  matematică prezentată utilizatorilor nu se verifică. La `stake = 10000` și cote cu 3
  zecimale, divergența poate ajunge la **zeci de credite**.
- **Sensul divergenței e nedeterminat** (pozitiv sau negativ), în funcție de sensul rotunjirii.

### 8.4 Verificări de rotunjire făcute corect

- **Rotunjirea e mereu la 2 zecimale, cu `Math.round(x*100)/100`** — pattern consistent în
  `:78`, `:79`, `user.service.ts:107`. Fără excepții.
- **ROI-ul** (`user.service.ts:99, 107`) e rotunjit la 2 zecimale la scriere. **Atenție:** ROI-ul
  e o valoare în **procente**, deci rotunjirea la 2 zecimale e corectă.
- **`profit` stocat în `Decimal(10,2)`** — `newProfit` (`:87`) poate fi un `number` cu multe
  zecimale; Prisma îl forțează la 2 la scriere. Deci `Number(user.profit)` citit la pasul
  următor e mereu deja rotunjit — **nu se acumulează eroare** pe termen lung. **Corect.**

### 8.5 Riscul de overflow la `Decimal(10,2)`

Coloana `balance` e `Decimal(10,2)` — maxim **99 999 999.99**. `potentialReturn` e tot
`Decimal(10,2)`. Cu `stake = 10000` și 20 selecții, `totalOdds` poate fi foarte mare. Dacă
`potentialReturn` depășește `99 999 999.99`, Postgres aruncă o eroare de overflow, tranzacția
se rollbackează, iar pariu rămâne `PENDING` la nesfârșit (settlement-ul nu o mai vede ca
decontabilă, dar nici nu o poate anula). **NECONFIRMAT — necesită verificare/test** (nu am
rulat DB). Recomandare: limitează `totalOdds` la un maxim explicit în `placeBet` (de ex. 1000),
ceea ce e o regulă de business rezonabilă pentru pari pe 20 selecții.

---

## 9. MARKET ANALYSIS

Verificare matematică a fiecărui market din `checkSelectionWon` (`bet.service.ts:261-352`).
Verificările le-am făcut prin derivare manuală, rulând mental formula pe scoruri concrete.
**Formula din coloana "Formula" e cea din cod**, inclusiv pentru cazurile greșite.

| Market | Formula | Status | Problemă |
|---|---|---|---|
| `1X2` | `1`→`home>away`; `X`→`home==away`; `2`→`away>home`; altfel `false` | **OK** | Selecție invalidă → pierdere, nu void. Corect pentru 1/X/2. |
| `DUPLA_HIPOTESE` | `1X`→`home>=away`; `X2`→`away>=home`; `12`→`home!=away`; altfel `false` | **OK** | Incluziunile non-stricte sunt corecte (egalitatea câștigă la 1X și X2). Selecție invalidă → pierdere. |
| `MARCAS_0_5` | `Mais 0.5`→`total>0.5`; **altfel** `total<0.5` | **BUG** | `else`-ul tratează orice selecție necunoscută (ex. `"Mais 3.5"`) ca **Menos 0.5**. |
| `MARCAS_1_5` | idem, `1.5` | **BUG** | idem |
| `MARCAS_2_5` | idem, `2.5` | **BUG** | idem |
| `MARCAS_3_5` | idem, `3.5` | **BUG** | idem |
| `MARCAS_4_5` | idem, `4.5` | **BUG** | idem |
| `AMBAS_MARCAM` | `Sim`→`h>0&&a>0`; `Não`→`h==0\|\|a==0`; altfel `false` | **OK** | Formulele corecte și complementare. Selecție invalidă → pierdere. |
| `RESULTADO_CORRETO` | `` `${home}-${away}` === selection `` | **OK** | Corect pentru orice scor. Cote limitate la 9 scoruri la generarea estimată (LOW §5.4), dar corectitudine OK. |
| `RESULTADO_INTERVALO` | `null` dacă lipsește HT; altfel `1`/`X`/`2` pe scorurile la pauză | **OK** | Corect — void dacă nu există date. **Niciun feed nu populează `halfTime*`** (NANDO.md §5), deci piața e inactivă prin design. |
| `HANDICAP_n1_5` | `Casa`→`(home-1.5)>away`; **altfel** `(away-1.5)>home` | **BUG — inversată** | Ramura „altfel" e citită ca handicap pe oaspeți, dar `odds.json` are `"Fora 1.5"` = vizitatorul **primește** +1.5. Formula corectă: `(away+1.5)>home`. Rezultat curent: **ambele picioane pierd**. |
| `HANDICAP_n0_5` | `Casa`→`(home-0.5)>away`; altfel `(away-0.5)>home` | **BUG — inversată** | idem. Corect: `Casa`→`home>away`; `Fora`→`away+0.5>home`. |
| `HANDICAP_0_0` | `return null` | **OK** | Push = void = refund. Corect. **Netestat** (LOW §5.5). |
| `HANDICAP_0_5` | `Casa`→`(home+0.5)>away`; altfel `(away+0.5)>home` | **BUG — inversată** | Dublă inversare: `Casa` primește +0.5 (corect ca sens), dar `Fora` scade 0.5 (greșit — vizitatorul ar trebui să primească +0.5 doar dacă e „handicap dat gazdei"; semantica feed-ului trebuie verificată). **NECONFIRMAT** — necesită verificare/test contra sursei. |
| `HANDICAP_1_5` | `Casa`→`(home+1.5)>away`; altfel `(away+1.5)>home` | **BUG — inversată** | idem |
| `IMPAR_PAR` | `Ímpar`→`total%2==1`; **altfel** `total%2==0` | **BUG** | `else` → orice selecție necunoscută e tratată ca **Par**. |
| `GOLOS_0`..`GOLOS_6` | `parseInt(market.split('_').pop())`; `total === expected` | **OK** | Corect. Nu depinde de `selection`, deci e imun la selecții invalide. |

### 9.1 Analiză detaliată a handicapurilor — convenția feed-ului

Formulele au o ambiguitate de **convenție** pe care codul nu o rezolvă: în `odds.json`,
`HANDICAP_0_5` are cheile `"Casa 0.5"` și `"Fora 0.5"` — ambele cu `0.5` pozitiv, ceea ce
sugerează că **ambele echipe primesc handicapul** (nu e handicap clasic, unde doar una
primește). `odds_engine.py:126-131` confirmă intenția:
```python
ah_markets[f"HANDICAP_{...}"] = {
    f"Casa {hc}": odds_from_prob(p_home_ah),   # (i + hc) > j
    f"Fora {abs(hc)}": odds_from_prob(p_away_ah) # (i + hc) < j
}
```
Pentru `hc = -0.5`: `p_home_ah` = prob. ca `home - 0.5 > away` (echipa gazdă pierde jumătate),
iar `p_away_ah` = prob. ca `home - 0.5 < away` (echipa oaspeților câștigă jumătate). Deci
cheile `"Casa -0.5"` / `"Fora 0.5"` înseamnă: gazdă handicapată cu −0.5, oaspeți cu +0.5.

**În `checkSelectionWon`, ramura `Casa` aplică corect `home + hc`, dar ramura de `else`
(oaspeții) aplică `away - hc` în loc de `away + hc`.** Formula corectă pentru vizitatori,
în convenția feed-ului, ar fi `(away + hc) > home` (pentru `hc` negativ, adică vizitatorul
favorizat). Codul face `(away - hc) > home` — **semnul e inversat pe ramura de oaspeți**.

Concret pentru `HANDICAP_n1_5` / `"Fora 1.5"` cu scor 2-1:
- Cod: `(1 - 1.5) > 2` → `false` (pierdere)
- Corect: `1 + 1.5 = 2.5 > 2` → `true` (câștig)

**NECONFIRMAT — necesită verificare/test** asupra convenției exacte a feed-ului oddspedia
pentru fiecare linie. Dar faptul că **ambele picioane ale unei piețe pierd** pentru orice
rezultat este un simptom care indică un bug, indiferent de convenție: o piață de handicap
în care niciun picio nu poate câștiga e sigur incorectă.

### 9.2 Recomandare de refactor (nu implementată, conform brief-ului)

Înlocuiește `checkSelectionWon` cu o funcție care întoarce `true | false | null`, unde
`null` înseamnă explicit **void**, și adaugă o funcție `isValidSelection(market, selection)`.
Toate ramurile `return false` de la final de ramură devin `return null`. Handicapurile
trebuie citite din semnul din `selection`, nu din market, și validate împotriva unei
whitelist.

---

## 10. SECURITY / AUTHORIZATION

### 10.1 Inventar de endpointuri și controale

| Endpoint | Middleware | Verdict |
|---|---|---|
| `POST /api/auth/register` | `validate(registerSchema)` | OK |
| `POST /api/auth/login` | `validate(loginSchema)` + rate limit 10/15min | OK |
| `GET /api/users/me` | `authenticate` | OK |
| `PATCH /api/users/me` | `authenticate` + validate | OK — actualizează doar `name`/`email` |
| `POST /api/users/change-password` | `authenticate` + validate | OK — cere parola curentă |
| `GET /api/bets` | `authenticate` | OK — `where: { userId }` (:99) |
| `GET /api/bets/active` | `authenticate` | OK |
| `GET /api/bets/:id` | `authenticate` | OK cu observație (HIGH §3.3) |
| `POST /api/bets` | `authenticate` + validate | OK — cote luate din DB |
| `POST /api/bets/:id/cancel` | `authenticate` | OK — ownership verificat (:146) |
| `POST /api/bets/settle` | `authenticate` + `requireAdmin` | OK |
| `GET /api/matches` | `authenticate` | OK — date publice |
| `PATCH /api/matches/:id/score` | `authenticate` + `requireAdmin` | OK |
| `POST /api/matches/sync` | `authenticate` + `requireAdmin` | OK |
| `GET /api/matches/all` | `authenticate` + `requireAdmin` | OK |
| `GET /api/notifications` | `authenticate` | OK — `where: { userId }` |
| `PATCH /api/notifications/:id/read` | `authenticate` | OK — ownership (:30) |
| `GET /api/groups/:id` | `authenticate` | OK — membership (:93) |
| `GET /api/rankings/group/:id` | `authenticate` | OK — membership (:29) |
| `GET /api/rankings/global` | `authenticate` | OK — expune balance/profit/roi tuturor |
| `/api/admin/*` | `router.use(authenticate, requireAdmin)` | OK — tot router-ul e protejat |
| `GET /api/cron/*` | `CRON_SECRET` | OK — vezi mai jos |

### 10.2 Probleme identificate

#### [MEDIUM] `GET /api/rankings/global` expune datele financiare ale tuturor utilizatorilor

- **File:** `apps/api/src/routes/ranking.routes.ts` + `services/ranking.service.ts`
- **Lines:** `ranking.routes.ts:8-16`, `ranking.service.ts:4-24`
- **Problem:** Orice utilizator autentificat poate lista primii 50 de utilizatori cu
  **`balance`, `profit`, `roi`, `betsCount`, `betsWon`** — adică date financiare individuale
  ale altor oameni. Nu există niciun `requireAdmin`, nici o limitare de vizibilitate.
- **Impact:** într-un context de „aplicție între prieteni", e o problemă de intimitate, nu
  neapărat de plată. Dar orice utilizator poate afla exact cât a câștigat/câștigă fiecare
  persoană, ceea ce e neprevăzut într-un produs cu date de joc.
- **NECONFIRMAT — necesită decizie de business.** Dacă leaderboard-ul e intenționat public
  (funcționalitate de tip clasament), atunci nu e o problemă. Dacă nu, e o scurgere de date.
- **Recommended fix:** fie expune doar un nume + poziție (fără sume exacte), fie cere
  consimțământ explicit, fie limite la ADMIN. Minim: înlocuiește `balance` cu un rang
  derivat, păstrând `profit`/`roi` doar pentru grupurile din care utilizatorul e membru.

#### [MEDIUM] `app.set('trust proxy')` nu e configurat → rate limitul poate fi evitat

- **File:** `apps/api/src/index.ts`
- **Lines:** 37–42 (`express-rate-limit`)
- **Problem:** `app.set('trust proxy', ...)` nu apare nicăieri (verificat prin grep). În
  deployment-ul Docker, Express vede toate cererile ca venind de proxy, deci
  `express-rate-limit` le tratează ca venind de aceeași IP — limite prea stricte. În
  deployment-ul Vercel, invers, limitarea e corectă.
- **Impact:** în Docker, utilizatorii din rețea pot fi blocați reciproc (DoS mutual), sau —
  dacă reverse-proxy-ul e configurat să forțeze headeruri — limitarea poate fi eludată prin
  spoofing de `X-Forwarded-For`.
- **Recommended fix:** setează `app.set('trust proxy', 1)` **doar** dacă deployment-ul e
  explicit în spatele unui proxy, și configurează corespunzător `express-rate-limit`.

#### [LOW] JWT de 7 zile, fără refresh token și fără revocare

- **File:** `apps/api/src/config/env.ts`, `services/auth.service.ts`
- **Lines:** `env.ts:12` (`JWT_EXPIRES_IN` default `'7d'`), `auth.service.ts:18-22`, `:51-55`
- **Problem:** Tokenul JWT e stateless, cu 7 zile de valabilitate implicită, fără
  revocare/refresh. Dacă un token e furat, utilizatorul blocat (`isBlocked`) nu poate fi
  oprit — `authenticate` (`auth.ts:11-26`) verifică doar semnătura, **nu** `isBlocked`.
- **Impact real redus:** `requireAdmin` revalidează `isBlocked` (`:35-37`), deci un utilizator
  blocat **nu** poate accesa rute admin. Dar poate încă să acceseze `POST /api/bets` și să
  plaseze pari cu un token vechi — deși `placeBet` verifică `user.isBlocked` în tranzacție
  (`:65`), deci e acoperit și acolo. `cancel`, `getById`, `listByUser` rămân accesibile.
- **Recommended fix:** adaugă verificarea `isBlocked` (sau o versiune de token) în
  `authenticate`, sau reduce `JWT_EXPIRES_IN` la 24h cu refresh token.

#### [LOW] `requireAdmin` face o interogare DB per cerere

- **File:** `apps/api/src/middleware/auth.ts`
- **Lines:** 28–44
- **Problem:** Corect din punct de vedere de securitate, dar adaugă un round-trip la DB pe
  fiecare cerere admin.
- **Impact:** performanță, nu securitate. **Acceptabil** pentru o aplicație de acest volum.
- **Recommended fix:** niciunul necesar. Doar documentat, pentru că pare un "TODO" dar e o
  decizie de proiectare deliberată (comment-ul din cod o explică).

### 10.3 Verificări făcute și **ne** găsite

- **Niciun IDOR exploatabil.** Verificat explicit pe: pari (ownership la `:146`, `:99`),
  notificări (`:30`), grupuri (membership la `:93`), rankings de grup (membership la `:29`).
- **Niciun bypass de autorizare admin.** `admin.routes.ts:10` aplică
  `router.use(authenticate, requireAdmin)` pe întregul router — deci toate cele 7 rute
  admin sunt protejate uniform. Nu există rută admin fără middleware.
- **Nicio modificare de balance de către utilizator.** Singurele rute care scriu `balance`
  sunt: `placeBet` (decrement, cu filtrare atomică), `settlePendingBets` (increment, cu
  gardă), `cancel` (increment, ownership + status), și `PATCH /api/admin/users/:id`
  (setare absolută, admin-only, validată 0–1 000 000). `userService.updateBalance` e cod
  mort (LOW §5.1).
- **Nicio vulnerabilitate XSS.** `grep -rn "dangerouslySetInnerHTML\|innerHTML\|eval("
  apps/web/src/` → niciun rezultat. React escapează prin default.
- **Nicio injecție SQL/SQLi.** Prisma parametriză toate interogările.
- **Validarea de input e consistentă** pe toate rutele POST/PATCH cu schimb de stare
  (Zod). Unica excepție: `GET /api/bets` folosește `validate(paginationSchema)` pe
  `req.body` (vid) — deci `req.query` **nu e validat deloc** (vezi LOW de mai jos).
  `status` din query ajunge direct în `where.status` (`bet.service.ts:100`) — un string
  necunoscut returnează pur și simplu zero rezultate, deci **fără risc de injecție**.
- **Rate limiting** pe `/api/` (200/15min) și pe auth (10/15min). **Vezi MEDIUM §4** despre
  impactul asupra rutelor de lichidare.
- **Helmet** e activ (cu CSP dezactivat explicit, `index.ts:30-33`) — deci protecție
  standard împotriva clickjacking-ului, MIME sniffing, etc.
- **CORS** limitat la `FRONTEND_URL` (`index.ts:34`).
- **Parole:** bcrypt cu 12 runde, minimum 6 caractene.

#### [LOW] `paginationSchema` validează `req.body`, nu `req.query`

- **File:** `apps/api/src/middleware/validation.ts` + `routes/bet.routes.ts`
- **Lines:** `validation.ts:6` (`schema.safeParse(req.body)`), `bet.routes.ts:21`, `:34`
- **Problem:** Middleware-ul `validate` aplică schema pe `req.body`. Dar rutele
  `GET /bets` și `GET /bets/active` trec prin `validate(paginationSchema)` — deci schema
  validează un corp **gol**, iar parametrii reali din `req.query` rămân **nevalidați**.
- **Impact:** `limit` e recalculat manual în rută (`parseInt(...) || 20`, `bet.routes.ts:25`),
  dar **fără plafonare** — spre deosebire de `GET /api/matches` care aplică
  `Math.min(..., 100)` (`match.routes.ts:12`). Deci `GET /api/bets?limit=999999` produce
  un `take` de 1 000 000, cu `include` pe selecții **și** pe `match` pentru fiecare. **DoS
  prin epuizare de memorie** — fiecare bet aduce un obiect `match` complet.
- **Severity: LOW-Medium.** Limitat de rate limiter (200/15 min) și de `+ 1` din
  `bet.service.ts:110`, dar un singur request cu `limit` mare poate consuma multă memorie.
- **Recommended fix:** plafonează `limit` în rută ca în `match.routes.ts`:
  `const limit = Math.min(parseInt(...) || 20, 100)`. Mai bine, creează un middleware
  `validateQuery` și folosește-l pentru parametrii de query.

---

## 11. TEST GAPS

### 11.1 Testele existente

| Fișier | Teste | Ce testează |
|---|---|---|
| `apps/api/tests/bet-logic.test.ts` | 11 | **O COPIE** a lui `checkSelectionWon` |
| `apps/api/tests/schemas.test.ts` | 13 | Schema-urile Zod |
| `apps/api/tests/env.test.ts` | 11 | Configurație env + schema-uri |
| `apps/web/tests/localStorage.test.ts` | 2 | Mock-ul localStorage |
| `apps/web/tests/hooks.test.ts` | 1 | Exporturile din `useIOS` |
| **Total** | **38** (35 API + 3 Web) | Toate trec ✅ |

### 11.2 Defectul critic al suitei: `bet-logic.test.ts` nu testează codul de producție

`tests/bet-logic.test.ts:1-9`:
```ts
// We import checkSelectionWon indirectly by reconstructing the logic
// since the service requires prisma. Instead test the pure logic function.
function checkSelectionWon(market, selection, match) { ... }   // <-- COPIE
```

Fișierul **recopia** funcția în loc să o importe. Consecințe directe:

| Market | Testul original | Codul real | Divergență |
|---|---|---|---|
| `RESULTADO_INTERVALO` cu `ht` lipsă | returnează **`false`** (linia 42) | returnează **`null`** (void) | **Testul ar eșua pe codul real** |
| `MARCAS_0_5`..`4_5` | **nu există** | există (5 case-uri) | neacoperit |
| `HANDICAP_*` | **nu există** | există (5 case-uri) | neacoperit |
| `GOLOS_0`..`6` | doar `GOLOS_2`, cu `total === 2` hardcodat | `parseInt(market.split('_'))` | **logică diferită, necomparată** |

**Acest lucru explică de ce CRITICAL §2.1 și §2.2 au supraviețuit:** un test care ar fi prins
`return false` în loc de `null` ar trebui să testeze codul real, iar codul real
(`bet.service.ts:313-314`) **returnează corect `null`** pentru cazul pe care testul îl
tratează drept `false`. Testul a codificat un comportament care nu mai există, deci nu poate
semnaliza regresia.

**Concluzie:** 11 din cele 35 de teste API sunt, în esență, **decorative** pentru logica de
decontare. Acoperirea reală a fluxului de bani e **zero teste**.

### 11.3 Teste lipsă — prioritizate

**P0 — Bani (fiecare ar prinde un bug real din acest raport):**

1. **Double cancel** — două `cancel()` pe același bet ⇒ balance incrementat **o singură dată**.
   (Ar fi prins: dacă `cancel` ar pierde garzile.)
2. **Cancel + settlement simultan** — rulat cu `Promise.all` pe aceeași pariu ⇒ fie
   `CANCELLED` + refund, fie `WON` + payout, **niciodată ambele**. (Ar fi prins: **Scenariul B,
   singurul race condition monetar găsit**.)
3. **Double settlement** — două `settlePendingBets()` pe aceeași pariu câștigătoare ⇒
   `balance` incrementat **o singură dată**, exact o notificare, `betsCount` +1.
4. **Double payout** — settlement repetat după ce pariu e deja `WON` ⇒ zero incrementări.
5. **placeBet concurent cu saldo limită** — utilizator cu 100 CR, două pari de 60, `Promise.all`
   ⇒ exact unul reușește, balance final 40, un singur Bet creat. (Ar fi prins orice
   regresie a filtrului `balance: { gte }`.)
6. **Settlement idempotent pe toate tranzițiile** — rulat de 3 ori ⇒ aceleași rezultate,
   `betsCount`/`betsWon`/`profit` neschimbate după prima.

**P1 — Corectitudine de decontare (fiecare ar fi prins un CRITICAL din §2):**

7. **Selecție invalidă → void, nu LOSS** — `checkSelectionWon('UNKNOWN_MARKET', 'X', m)`
   trebuie să înțeleagă `null`. (Astăzi: `false` ⇒ pierdere.)
8. **MARCAS cu selecție necunoscută** — `'Mais 3.5'` pe `MARCAS_2_5` ⇒ `null`, nu `false`.
9. **`FINISHED` fără scor → void** — meci cu `homeScore: null, awayScore: null, status:
   'FINISHED'` ⇒ selecțiile void, pariu anulat cu **refund**, nu pierdut.
10. **Toate formulele de handicap** — tabel cu (market, selecție, scor, așteptat) pentru
    `-1.5`, `-0.5`, `0.0`, `+0.5`, `+1.5`. **Astăzi toate prind bug-ul** (§9.1).
11. **`HANDICAP_0_0` returnează `null`** (push) — caz explicit, acum neacoperit.
12. **Selecție pierdută + selecție void** — pariu cu o selecție LOST și una void ⇒ `LOST`,
    **fără refund** (ramura `anyLost` precedă `anyVoid`, `bet.service.ts:215-225`).
13. **Selecție pierdută + selecție PENDING** ⇒ `continue` la `:227` — pariu rămâne `PENDING`,
    **fără** stats și **fără** notificare. Important: verifică și că `betsCount` **nu** crește.
14. **Toate void + toate FINISHED ⇒ CANCELLED + refund** (`:229-242`).
15. **POSTPONED** ⇒ void pentru selecția respectivă; **`CANCELLED`** (meci) ⇒ idem.
16. **Meci necunoscut — `default: return false`** trebuie devine `null`.

**P2 — Bani / rotunjire:**

17. **Invariantul `stake × totalOdds === potentialReturn`** după plasare, pentru un set de cote
    cu 3 zecimale și stake la limită (10000). (Prinde **MEDIUM §4**.)
18. **Stake fracționar respingut** de Zod (`10.005` ⇒ 400). (Prinde **MEDIUM §4**.)
19. **Cota modificată între plasare și settlement** — pariu plasat la 1.90, cota devine 2.10,
    settlement-ul plătește **1.90** (snapshot-ul din `BetSelection.odds`, nu valoarea curentă).
20. **Payout exact** — `potentialReturn` stocat e suma la care se incrementează balance-ul,
    bit cu bit.

**P3 — Autorizare:**

21. **Utilizator A nu poate citi pariu al lui B** (`GET /bets/:id` ⇒ 404).
22. **Utilizator A nu poate anula pariu al lui B** (⇒ 400).
23. **Utilizator normal pe `POST /bets/settle`** ⇒ 403.
24. **Utilizator normal pe `PATCH /api/admin/users/:id`** ⇒ 403 (schimbare de balance).
25. **Utilizator blocat nu poate plasa pari** (`:65` — deja implementat, neacoperit).
26. **Token cu rol ADMIN în JWT dar demisat în BD** ⇒ 403 pe rute admin (deja implementat
    prin re-query, neacoperit).

**P4 — Notificări / consistență tranzacțională:**

27. **Notificare fără settlement** — settlement eșuat ⇒ zero notificări create.
28. **Settlement fără notificare** — settlement reușit ⇒ exact o notificare, cu `tx`.
29. **`GET /api/notifications` nu conține notificări din rollback** — tranzacție care aruncă
    după `notificationService.create`.

### 11.4 Refactor necesar înainte de orice test nou

Testele 1–16 **nu pot fi scrise** până când `checkSelectionWon` nu e **exportat ca funcție
pură, independentă de Prisma**. Recomandare: extrage `checkSelectionWon` și
`isValidSelection` într-un modul fără importuri (ex. `src/lib/markets.ts`), apoi:
- `bet.service.ts` le importă;
- `tests/markets.test.ts` le importă **direct** (nu mai copiază).

Fără acest refactor, orice test scris va reintroduce problema din `bet-logic.test.ts` — teste
care testează o copie, nu codul care rulează în producție.

---

## 12. DOCUMENTATION SYNC

Am comparat README.md, NANDO.md și AGENTS.md cu codul. Rezultă:

### 12.1 NANDO.md — **accurate, cu două excepții**

Am verificat afirmațiile principale și sunt corecte:
- ✅ „`RESULTADO_INTERVALO` a fost eliminat din odds generate" — confirmat: `generateOdds`
  (`match.service.ts:262-273`) nu îl conține.
- ✅ „Niciun feed nu populează `halfTimeHome`/`halfTimeAway`" — confirmat: `match.service.ts:96-104`
  scrie doar `homeScore`/`awayScore`/`status`.
- ✅ „`node-cron` e dependență dar **nunca importată**" — confirmat prin grep: nicio
  utilizare în `apps/api/src/`.
- ✅ „Nu există temporizator în server; lichidarea e doar prin HTTP" — confirmat: `index.ts`
  nu are `setInterval`/`setTimeout` pentru settlement.
- ✅ „`HANDICAP_0_0` devolve `null` por design (push)" — confirmat (`bet.service.ts:326-327`).
- ✅ Descrierea corectă a gardelor de dublare (`updateMany` cu `status: 'PENDING'`).
- ✅ „`requireAdmin` revalidează în BD" — confirmat (`auth.ts:32-40`).
- ✅ Nota despre ROI (`updateStats` nu dublează `stake` când e `tx`) — confirmat
  (`user.service.ts:96-97`).

**Excepție 1 (materială):** NANDO.md §6 spune: *„Se todas as escolhas estão `null` e o jogo
está `FINISHED` → `CANCELLED` com devolução do stake."* — corect. Dar **nu** menționează
că `checkSelectionWon` returnează `null` doar pentru `RESULTADO_INTERVALO` și
`HANDICAP_0_0`. Pentru **orice altă selecție invalidă** — inclusiv toate handicapurile, din
pauza de feed-ului — returnează `false` şi decontat ca pierdere. Documentează comportamentul
corect, dar omite cazul care produce efectul opus.

**Excepție 2 (materială):** NANDO.md §5 afirmă că piețele cu `checkSelectionWon` dar fără
odds estimate sunt doar handicapurile și `GOLOS_*`. Corect ca inventar. Dar **nu** semnalează
că ramurile lor de handicap au formulele inversate.

**Excepție 3 (minoră):** NANDO.md §11 spune „`npm test` # 27 testes". Reality: **35** teste
API (11 + 13 + 11) + 3 web = **38**. Numărul e depășit.

### 12.2 README.md — **depășit în mai multe puncte**

| Locație | Afirmație | Realitate |
|---|---|---|
| `README.md:63` | „**Tested** — 30 unit tests" | 38 teste (35 API + 3 Web) |
| `README.md:312` | „tests/ # 17 API tests" | 35 teste API |
| `README.md:466` | „Run all tests (30 total)" | 38 |
| `README.md:469` | „Run API tests only (27 tests)" | 35 |
| `README.md:480-484` | Tabel per-fișier: `bet-logic.test.ts` = 11, `schemas.test.ts` = 5, `env.test.ts` = 11, `localStorage` = 2, `hooks` = 1 | `schemas.test.ts` are **13**, nu 5 |
| `README.md:481` | „`bet-logic.test.ts` — **Bet settlement logic (all markets)**" | **Fals.** Testează o *copie* și acoperă 8 din 18 case-uri. Nimic din handicapuri, `MARCAS_0_5`–`4_5`, `GOLOS_0..6`. Vezi §11.2 |
| `README.md:60` | „11 Betting Markets" | `checkSelectionWon` conține **18** case-uri; `generateOdds` produce 10 piețe, `odds.json` conține ~20 |

README-ul mai listează `POST /api/bets/settle` ca „Admin" (`:394`) — corect — și descrie
fluxul de licidare ca fiind automat, ceea ce contrazice NANDO.md §10 (nu există
temporizator). **Discrepanță între cele două documente.**

### 12.3 AGENTS.md — **fără afirmații relevante depășite**

Nu conține referiri la settlement, lock-uri, ROI, sau piețe care să fie contrazise de cod.
Documentul e orientat pe convenții de dezvoltare, nu pe descrierea comportamentului. **OK.**

### 12.4 Recomandări de documentare

1. Corectează numărătoarele de teste din README (la 38 / 35 / 3).
2. **Corectează sau șterge afirmația „`bet-logic.test.ts` — settlement logic (all
   markets)"** — e activ fals și explică de ce bug-urile au supraviețuit.
3. Adaugă în NANDO.md §5 un avertisment despre comportamentul actual al handicapurilor.
4. Reconciliază README vs NANDO.md despre lichidarea automată.
5. **Ideal:** generează secțiunea de teste din README automat, dintr-un runner, ca să nu
   devină din nou stale.

---

## 13. RECOMMENDED FIX ORDER

Ordinea reflectă: (a) blocaje de corectitudine monetară, (b) blocaje de pierdere de bani,
(c) integritate de date, (d) robustețe, (e) igienă.

### Faza 0 —blocaje imediate (blochează tot ce urmează)

| # | Fix | Sev | Motiv |
|---|---|---|---|
| 1 | **`checkSelectionWon`: `false` → `null` pentru selecții necunoscute și pentru scor lipsă** (`:267-268`, `:290-298`, `:336`, `:349-350`) | CRITICAL | 2 minute de cod, oprește pierderea de bani pe selecții invalide și pe meciuri fără scor. **Face posibilă scrierea testelor din P1.** |
| 2 | **Corectează formulele de handicap** (`:320-333`), citind semnul din `selection` | CRITICAL | Ambele picioane ale unei piețe de handicap pierd acum. Verifică convenția feed-ului mai întâi. |
| 3 | **`cancel()`: înlocuiește `bet.update` cu `updateMany` cu gardă `status: 'PENDING'`, înainte de increment** (`:149-157`) | CRITICAL | Închide singurul race condition monetar din §7 (Scenariul B). |

**După faza 0, fluxul de bani e corect pentru toate cele 6 scenarii din §7.**

### Faza 1 — teste (înainte de orice altă schimbare)

| # | Acțiune | Sev | Motiv |
|---|---|---|---|
| 4 | Extrage `checkSelectionWon` + `isValidSelection` într-un modul pur (fără Prisma) | HIGH | **Precondiție** pentru orice test de decontare. Fără asta, testele copiază codul (ca `bet-logic.test.ts` de acum) și nu detectează regresii. |
| 5 | Șterge `bet-logic.test.ts` (testează o copie) | HIGH | Dă falsă încredere. Înlocuiește cu `tests/markets.test.ts` care importă funcția reală. |
| 6 | Scrie testele P0 (1–6) din §11.3 — banii | HIGH | Acoperă explicit double-cancel, double-settlement, double-payout, overdraft concurent. |
| 7 | Scrie testele P1 (7–16) — corectitudine de decontare | HIGH | Acoperă selecțiile invalide, scorul lipsă, handicapurile, tranzițiile LOST/VOID/PENDING. |

### Faza 2 — robustețe operațională

| # | Fix | Sev | Motiv |
|---|---|---|---|
| 8 | **Închide tranzacția per pariu (sau per lot) în `settlePendingBets`** + opțiuni explicite `{ maxWait: 10_000, timeout: 30_000 }` | HIGH | O singură rulare e o singură tranzacție gigant cu timeout de 5 s. Totul se rollbackează peste limită. |
| 9 | Adaugă `orderBy: { id: 'asc' }` la `findMany` din `settlePendingBets` (`:164`) | MEDIUM | Ordine deterministă → evită deadlock-ul între două rulări concurente. **NECONFIRMAT** că se produce, dar fixul e gratuit. |
| 10 | `updateStats`: folosește `{ increment: ... }` în loc de read-modify-write (`:84-108`) | HIGH | Pierdere de actualizare pe statistici la rulări concurente. |
| 11 | Excluie `/api/cron/*` din rate limiter | MEDIUM | Cronul nu trebuie să consume bugetul utilizatorilor. |
| 12 | Limitează explicit `totalOdds` în `placeBet` | MEDIUM | Protejează împotriva overflow-ului pe `Decimal(10,2)`. **NECONFIRMAT.** |

### Faza 3 — corectitudine numerică și UI

| # | Fix | Sev | Motiv |
|---|---|---|---|
| 13 | Calculează `potentialReturn` din `totalOdds` **rotunjit**, nu din cel brut (`:59-60, 78-79`) | MEDIUM | Face valid invariantul `stake × totalOdds === potentialReturn`. |
| 14 | Zod: `stake: ...multipleOf(0.01)` | MEDIUM | Elimină inconsistența stake fracționar. |
| 15 | `cancel()`: mesaje de eroare distincte (`:60-63`) | LOW | Utilizatorul află *ce* n-a mers. |
| 16 | `BET_CREATED`: comentariu că e best-effort, deliberat în afara tranziției (`:93`) | LOW | Documentează intenția, ca să nu fie „corectat" greșit. |
| 17 | Plafonează `limit` în `GET /api/bets` ca în `GET /api/matches` | LOW-MEDIUM | Împiedică `take` uriaș cu `include` nested. |

### Faza 4 — market handling

| # | Fix | Sev | Motiv |
|---|---|---|---|
| 18 | Validează selecția în `placeBet` (whitelist per market) | HIGH | **Apără în față** — un utilizator nu ar trebui să poată plasa pe o piață nesuportată. Complementar cu fixul #1. |
| 19 | Decide soarta piețelor `RESULTADO_INTERVALO` (feed nu are HT) | MEDIUM | Situație documentată în NANDO.md; merită o decizie explicită, nu doar un comentariu. |

### Faza 5 — securitate și igienă

| # | Fix | Sev | Motiv |
|---|---|---|---|
| 20 | Decide vizibilitatea `GET /rankings/global` (date financiare) | MEDIUM | **Decizie de business** înainte de orice schimbare de cod. |
| 21 | `app.set('trust proxy', ...)` conform deployment-ului | MEDIUM | Corectează rate limiting-ul în Docker. |
| 22 | Verifică `isBlocked` și în `authenticate` (opțional: revocare token) | LOW | Token furat rămâne valid 7 zile. |
| 23 | `orderBy: { id: 'asc' }` + `@@index([userId, createdAt])` pentru cursor | LOW | Performanță la volum mare. |
| 24 | Elimină `userService.updateBalance()` (cod mort) | LOW | Mai puțin suprafață de atac. |
| 25 | Mergi citirile de `match`/`odds` în interiorul tranzacției din `placeBet` | MEDIUM | Închide fereastra dintre verificare și debit. |

### Faza 6 — documentare

| # | Acțiune |
|---|---|
| 26 | Corectează numărătoarele de teste în README (38 / 35 / 3) |
| 27 | Corectează sau șterge „settlement logic (all markets)" din README:481 |
| 28 | Adaugă în NANDO.md §5 avertismentul despre handicapuri |
| 29 | Reconciliază README vs NANDO.md privind lichidarea automată |

---

## 14. NOTE DE METODĂ

**Ce am făcut:**
- Lectură integrală a `apps/api/src/**` (17 fișiere), `apps/api/prisma/schema.prisma`,
  `apps/api/tests/**`, `apps/web/src/**` (fișierele relevante), documentația.
- Rulat suita de teste: **API 35/35 pass**, **Web 3/3 pass**. Fără modificări.
- Calculat exemplele numerice din §4 rulând formula **exactă** din cod (Node.js, fără
  modificare de fișiere).
- Verificat tipurile generate de Prisma (`node_modules/.prisma/client/index.d.ts:10089-10109`)
  pentru a confirma că filtrul `balance: { gte }` e permis de `update()` în Prisma 5.22.
- Verificat documentația oficială Prisma pentru `extendedWhereUnique` (GA din Prisma 5).
- Analizat `odds.json` și `odds_engine.py` pentru a stabili **convenția reală** a piețelor de
  handicap, necesară pentru §9.1.

**Ce NU am făcut (limite ale mediului):**
- **Nu am pornit baza de date.** Docker nu e disponibil (`docker: command not found`). Prin
  urmare, afirmațiile marcate **NECONFIRMAT** (existența deadlock-ului între două rulări
  de settlement, overflow-ul `Decimal(10,2)`, comportamentul driverului la stake fracționar,
  feed-ul care produce `FINISHED` fără scor) **nu au fost verificate empiric**.
- **Nu am executat `tsc --noEmit`.** NANDO.md §11 îl recomandă; l-aș fi rulat ca verificare
  suplimentară, dar nu afectează nicio constatare de mai sus.
- **Nu am modificat niciun fișier al aplicației** și **nu am făcut commit**.
- **Nu am folosit subagenți** — inspecția a fost făcută direct, etapizat.

**Încredere în constatări:**

| Concluzie | Nivel de încredere |
|---|---|
| Dublu cancel/settle/payout imposibil (§7 A,C,D,E,F) | **Foarte mare** — rezultă direct din cod și din izolarea Read Committed |
| Dublu refund în cancel+settle (§7 B) | **Mare** — `bet.update` necondiționat la `bet.service.ts:154-157` |
| Selecții invalide decontate ca pierdere (§2.1) | **Foarte mare** — lizibil direct din `switch`, fără ambiguitate |
| Handicapuri inversate (§9.1) | **Mare pentru inversia din cod**, **medie pentru sensul corect** (depinde de convenția feed-ului) |
| `FINISHED` fără scor → pierdere (§2.2) | **Foarte mare pentru codul**, **medie pentru frecvența în producție** (depinde de feed) |
| Inconsistența de rotunjire (§4) | **Foarte mare** — calculată numeric |
| Timeout-ul tranzacției (§3.1) | **Foarte mare** — default-ul Prisma e documentat în clientul generat |
| Pierderea de actualizare în `updateStats` (§3.2) | **Mare** — read-modify-write e evident; impactul real depinde de execuția concurentă |

---

*Raport generat prin inspecție statică. Niciun fișier al aplicației nu a fost modificat.
Niciun proces, server sau watcher nu rulează.*



