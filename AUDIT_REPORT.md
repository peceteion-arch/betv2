# betNANDO — Codebase Audit

**Data:** 2026-09-25
**Âmbito:** `E:\BetNando\betNANDO` (repositório real — o prompt indica `E:\BetNando`, que contém apenas o ficheiro do prompt)
**Ficheiros lidos:** 60 de 60 ficheiros de código/configuração (100% — excluídos apenas `node_modules`, `dist`, `package-lock.json`, e assets binários)

---

## 0. Correções ao pedido — o que o prompt assume vs. o que existe

Antes da análise, cinco afirmações do `audit_prompt.txt` não correspondem ao código. Isto condiciona as secções 1, 3 e 6.

| # | O prompt afirma | Realidade | Impacto |
|---|---|---|---|
| 1 | `packages/` com workspaces partilhados | **Não existe.** O glob `"packages/*"` está declarado no `package.json:7` mas o directório nunca foi criado. Zero dependências internas partilhadas — `api` e `web` não se importam mutuamente. | A "Turborepo pipeline" é apenas `turbo` a correr 2 workspaces independentes. |
| 2 | `prisma/` na raiz | **Não existe.** O schema está em `apps/api/prisma/`. | Caminho do schema corrigido na §2. |
| 3 | `apps/api/src/jobs/settleBets.job.ts` | **Não existe.** Não há pasta `jobs/`. | Ver §6 — a crontologia é externa (HTTP). |
| 4 | `src/services/settlement.service.ts` | **Não existe.** O motor de liquidação é `betService.settlePendingBets()` em `apps/api/src/services/bet.service.ts:150`. | Ver §3.3. |
| 5 | 11 mercados de apostas | **São 22** no motor de liquidação, mas apenas **11 são gerados** por `generateOdds()`. | Ver §3.1 — há mercados órfãos. |

**Nota adicional:** o `AGENTS.md:46` documenta `src/jobs/` com精确 "every 30 min" / "every 2 min". A documentação está errada — não existe tal código. O `POSTS_PRONTOS.md:74` está correcto: *"HTTP cron endpoints instead of node-cron (works on Vercel)"*.

---

## 1. ARQUITECTURA & MAPA DO MONOREPO

### 1.1 Layout real

```
betNANDO/
├── api/index.js              ← entrypoint serverless Vercel (8 linhas)
├── package.json              ← npm workspaces: apps/*, packages/*
├── turbo.json                ← 4 tasks: build, dev, lint, test
├── tsconfig.base.json        ← strict:true, ES2020, bundler resolution
├── Dockerfile                ← multi-stage, serve estático + API
├── docker-compose.yml        ← postgres:16-alpine + api + web
├── vercel.json               ← rotas /api/(.*) → /api/index.js
├── dev.bat / stop.bat        ← scripts Windows de desenvolvimento
│
├── apps/api/                 ← Express 4 + Prisma 5 + PostgreSQL
│   ├── prisma/schema.prisma  ← 8 modelos, 0 enums
│   ├── prisma/seed.ts        ← 1 admin + 5 users + 1 grupo
│   ├── odds.json             ← 2504 linhas, output do scraper
│   ├── odds_engine.py        ← gerador Poisson (164 linhas)
│   ├── scraper.py            ← scraper Oddspedia → odds.json
│   ├── tests/                ← bet-logic, env, schemas
│   └── src/
│       ├── index.ts          ← bootstrap Express (141 linhas)
│       ├── config/           ← env.ts (env + Zod), swagger.ts
│       ├── lib/prisma.ts     ← singleton globalThis
│       ├── middleware/       ← auth.ts, validation.ts
│       ├── routes/           ← 8 ficheiros, 28 endpoints
│       └── services/         ← 8 ficheiros
│
└── apps/web/                 ← React 18 + Vite 5 + Tailwind 3 + Zustand 4
    ├── public/               ← manifest.json, sw.js, ícones PWA
    ├── tests/                ← hooks, localStorage
    └── src/
        ├── main.tsx          ← BrowserRouter + AuthProvider
        ├── App.tsx           ← 13 rotas, 2 guards
        ├── lib/              ← api.ts (axios), auth.tsx (Context)
        ├── store/betSlip.ts  ← Zustand
        ├── hooks/useIOS.ts   ← detecção iOS/Safari/standalone
        ├── components/       ← BetSlip, InstallBanner, layout/
        └── pages/            ← 14 ficheiros
```

### 1.2 Pipeline Turborepo (`turbo.json`)

```json
"build": { "dependsOn": ["^build"], "outputs": ["dist/**"] }
"dev":   { "cache": false, "persistent": true }
"lint":  { "dependsOn": ["^build"] }
"test":  { "dependsOn": ["build"], "cache": false }
```

Observações:
- `^build` resolve para dependências de workspace — mas **não existem dependências entre workspaces**, portanto é sempre um no-op.
- `test` depende de `build` global, ou seja correr testes força compilação completa do API primeiro. Desacoplado do ideal.
- **Não existe task `db:generate`.** Os scripts `db:*` no `package.json:16-19` são npm scripts diretos com `cd`, não tasks do Turbo. Logo `turbo build` **não regenera o Prisma Client** — depende de o `generate` ter corrido manualmente antes. Isto está地表 no `Dockerfile:21` (`RUN cd apps/api && npx prisma generate`), que o faz explicitamente por causa disto.

### 1.3 Fluxo de dependências e env

- **Dependências:** zero partilhadas. `api` e `web` declaram cada um as suas. A única "ponte" é o contrato HTTP + o path `/api`.
- **Env vars** (`apps/api/src/config/env.ts:3-11`) — objecto simples com fallbacks, **sem validação Zod apesar de `zod` estar importado no mesmo ficheiro**:

| Variável | Default | Uso |
|---|---|---|
| `DATABASE_URL` | `''` | Prisma datasource |
| `JWT_SECRET` | `''` | Assinatura JWT — falha fatal em `index.ts:25` |
| `JWT_EXPIRES_IN` | `'7d'` | Expiração do token |
| `PORT` | `3001` | `index.ts:34` re-lê `process.env.PORT` directamente (ignora `env.PORT`) |
| `FOOTBALL_DATA_API_KEY` | `''` | football-data.org — vazio ⇒ fallback |
| `FRONTEND_URL` | `http://localhost:5173` | Origem CORS |
| `CRON_SECRET` | `''` | Bearer token dos endpoints cron |

**Defeito:** `CRON_SECRET` não é verificada no arranque. Com o `.env` ausente de `CRON_SECRET`, `env.CRON_SECRET` = `''` e a comparação `req.headers.authorization !== 'Bearer '` passa para um header `Authorization: Bearer ` (espaço final). Risco real, não teórico.

- **Divergência de port:** Vite corre em **5555** (`apps/web/vite.config.ts:8`) mas `FRONTEND_URL` e CORS por omissão apontam para **5173** (`env.ts:9`). Em desenvolvimento `npm run dev`, os pedidos cross-origin do browser recebem CORS bloqueado. Só funciona porque o proxy Vite (`vite.config.ts:10-14`) reescreve `/api` para `localhost:3001`, tornando a请求 same-origin. O CORS só é exercido no Docker (web em 5173).

### 1.4 Duas variantes de deploy

**Vercel (serverless)** — `api/index.js` faz `process.chdir()` para `apps/api`, carrega o `.env` de lá, e importa `../apps/api/dist/index.js`. `index.ts:135` não chama `app.listen` se `process.env.VERCEL` está definido.
> ⚠️ O `process.chdir()` é inefectivo no runtime serverless da Vercel (lambdas correm com cwd imutável e decompilação em `/var/task`). O `.env` também não é捆绑 na lambda (`vercel.json` só inclui `apps/api/**` via `includeFiles`).

**Docker / Render** — `Dockerfile` multi-stage. O `CMD` final corre `prisma db push --skip-generate && prisma db seed && node dist/index.js`. Servidor único em 3001 a servir também o `web/dist` estático (`index.ts:109-117`), com SPA fallback para `index.html`.

> ⚠️ `prisma db seed` corre em **cada arranque**. É idempotente (usa `upsert` em tudo), mas o `admin123` / `password123` do `seed.ts:66-68` fica permanentemente garantido em qualquer ambiente que use esta imagem. Risco de credenciais conhecidas em produção.

---

## 2. BASE DE DADOS — `apps/api/prisma/schema.prisma`

### 2.1 Convenções

- Provider: `postgresql`, URL de `env("DATABASE_URL")`.
- **Zero enums.** `role` e `status` são `String` com `@default`. Nenhuma validação a nível de BD.
- Todos os nomes de tabela `@map("snake_case")`; todos os campos mapeados explicitamente para snake_case.
- PKs: `cuid()` em todos os 8 modelos.
- **Sem migrações.** O projeto usa `prisma db push` directo — confirmado em `AGENTS.md:102`. Não há pasta `migrations/`, logo **não há histórico de alterações nem capacidade de rollback**.

### 2.2 Inventário dos 8 modelos

#### `User` → tabela `users`
| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `name` | `String` | |
| `email` | `String` | **`@unique`** |
| `passwordHash` | `String` | → `password_hash` |
| `balance` | `Decimal(10,2)` | **`@default(100)`** — créditos virtuais iniciais |
| `betsCount` | `Int` | `@default(0)` → `bets_count` |
| `betsWon` | `Int` | `@default(0)` → `bets_won` |
| `roi` | `Decimal(10,2)` | `@default(0)` |
| `profit` | `Decimal(10,2)` | `@default(0)` |
| `role` | `String` | `@default("USER")` — `"USER"` \| `"ADMIN"`, sem enum |
| `isBlocked` | `Boolean` | `@default(false)` |
| `createdAt`/`updatedAt` | `DateTime` | `now()` / `@updatedAt` |

Relações: `bets[]`, `groupMembers[]`, `notifications[]`, `groupsOwned[]` (named `"GroupAdmin"`).
Índices: **nenhum** (só a unique do email).

#### `Group` → `groups`
`id`, `name`, **`inviteCode @unique`** → `invite_code`, `adminId` → `admin_id`, `createdAt`, `updatedAt`.
Relações: `admin User @relation("GroupAdmin", fields:[adminId], references:[id])` — **sem `onDelete`** ⇒ defaults a `Restrict`.
`members GroupMember[]`. **Sem índices explícitos.**

#### `GroupMember` → `group_members`
`id`, `groupId`, `userId`, `joinedAt`.
**`@@unique([groupId, userId])`** — gera o índice composto `groupId_userId`, usado como chave de lookup em `group.service.ts:91` e `ranking.service.ts:29`.
Ambas as relações com **`onDelete: Cascade`**.

#### `Match` → `matches`
`id`, **`externalId @unique`** → `external_id` (chave de idempotência da sync), `homeTeam`, `awayTeam`, `homeCrest?`, `awayCrest?`, `league`, `country`, `matchday Int?`, `groupStage?`, `matchDate`, `status @default("SCHEDULED")`, `homeScore Int?`, `awayScore Int?`, `halfTimeHome Int?`, `halfTimeAway Int?`, `updatedAt @updatedAt`.
Relações: `odds[]`, `betSelections[]`.
Índices: **`@@index([status])`**, **`@@index([matchDate])`** — suportam os queries de `listUpcoming`/`listLive`.

#### `Odds` → `odds`
`id`, `matchId`, `market`, `selection`, `value Decimal(10,2)`, `source @default("estimated")`, `updatedAt`.
**`@@unique([matchId, market, selection])`** — impede duplicação de odds; é a chave conceptual de um mercado.
`@@index([matchId])`. Relação `match` com **`onDelete: Cascade`**.

#### `Bet` → `bets`
`id`, `userId`, `stake Decimal(10,2)`, `totalOdds Decimal(10,2)`, `potentialReturn Decimal(10,2)`, `status @default("PENDING")`, `createdAt`, `settledAt DateTime?`.
Relações: `user` (sem `onDelete` ⇒ `Restrict`), `selections[]`.
Índices: **`@@index([userId])`**, **`@@index([status])`**.

#### `BetSelection` → `bet_selections`
`id`, `betId`, `matchId`, `market`, `selection`, `odds Decimal(10,2)`, **`won Boolean?`**.
`won` tri-estado: `true` = ganho, `false` = perdido, `null` = void/push.
Relações: `bet` **`onDelete: Cascade`**, `match` **sem `onDelete`** (Restrict — apaga um match com apostas em curso falha).
**Sem índices explícitos** — nenhum índice sobre `matchId` apesar de haver FK.

#### `Notification` → `notifications`
`id`, `userId`, `type`, `message`, `read Boolean @default(false)`, `createdAt`.
`@@index([userId])`. Relação `user` **`onDelete: Cascade`**.

### 2.3 Diagrama relacional

```
                    ┌──────────────┐
              ┌─────│    User      │─────┐
              │     └──────┬───────┘     │
              │            │             │  (Restrict — sem onDelete)
     1:N      │            │ 1:N         │
┌──────────┐  │            │             │
│  Group   │  │            │             │
│(adminId)─┼──┘ (Restrict)│             │
└────┬─────┘               │             │
     │ 1:N                 │             │
┌────▼──────────┐          │             │
│ GroupMember   │          │             │
│  UNIQUE(g,u)  │          │             │
│  Cascade ↓↓   │          │             │
└───────────────┘          │             │
                           │             │
          ┌────────────────┴─────┐       │
          │         Bet          │◄──────┘
          └───────────┬──────────┘
                      │ 1:N (Cascade)
          ┌───────────▼──────────┐
          │   BetSelection       │──────► Match  (Restrict)
          │  won: true|false|null│
          └──────────────────────┘
                              ┌─────────┐
          User ──1:N(Cascade)─►│  Odds   │◄──1:N(Cascade)── Match
                              └─────────┘
          User ──1:N(Cascade)─►Notification
```

### 2.4 Comportamento de delete — inconsistência importante

| Relação | `onDelete` | Efeito |
|---|---|---|
| `GroupMember.group` | **Cascade** | apagar grupo limpa membros |
| `GroupMember.user` | **Cascade** | apagar utilizador limpa创始 members |
| `Group.admin` | **ausente** → Restrict | ⚠️ **admin.service.ts:69-75 chama `prisma.user.delete()` sem verificar.** Apagar um utilizador que seja dono de um grupo **lança erro de foreign key** (P2003), devolvido ao admin como 400 genérico. |
| `Odds.match` | **Cascade** | |
| `BetSelection.bet` | **Cascade** | |
| `BetSelection.match` | **ausente** → Restrict | ⚠️ `adminService` não tem delete de match, mas qualquer dele futuro bloquearia se houver apostas. |
| `Notification.user` | **Cascade** | |
| `Bet.user` | **ausente** → Restrict | histórico de apostas é preservado (intencional) |
| `Match` ← `Bet.user` | — | balance nunca é "perdido" por cascade |

**Inconsistência de rigor:** `Group.admin` tem Restrict enquanto `GroupMember.user` tem Cascade. O `deleteUser` só protege explicitamente o role ADMIN (`admin.service.ts:72`), não propriedade de grupos.

---

## 3. FLUXOS DE DADOS E LÓGICA DE SERVIÇO

### 3.0 Inventário de `apps/api/src/services/`

O prompt pede 8 ficheiros; existem exactamente 8, mas **um é diferente**: existe `admin.service.ts` (não listado no prompt) e falta `settlement.service.ts` (pedido no prompt).

| Ficheiro | Linhas | Responsabilidade |
|---|---|---|
| `auth.service.ts` | 59 | register / login, bcrypt + JWT |
| `user.service.ts` | 94 | perfil, password, balance, stats |
| `match.service.ts` | 276 | ingestão, odds, fallback, scraper |
| `bet.service.ts` | 293 | **apostas E liquidação** |
| `group.service.ts` | 113 | CRUD de grupos + convites |
| `ranking.service.ts` | 54 | leaderboard global / grupo |
| `notification.service.ts` | 42 | CRUD de notificações |
| `admin.service.ts` | 91 | gestão de utilizadores/grupos/stats |

### 3.1 `match.service.ts` — ingestão e geração de odds

#### Cadeia de fallback (`fetchFromApi`, `match.service.ts:26-59`)

```
fetchFromApi('WC')
  ├─ !FOOTBALL_DATA_API_KEY ──────────────► getFallbackMatches()
  ├─ fetch() → !response.ok ───────────────► getFallbackMatches()
  ├─ fetch() → throw ─────────────────────► getFallbackMatches()
  └─ success ──────────────────────────────► data.matches.filter/map
```

O `catch { }` em `:56-58` é **totalmente silencioso** — qualquer erro de rede, timeout ou parse de JSON produz um fallback de dados fictícios sem registo nenhum. O operador não tem forma de saber se está a servir dados reais.

`mapStatus` (`:65-76`) traduz os estados do football-data.org. `TIMED`→`SCHEDULED`, `IN_PLAY`/`PAUSED`→`LIVE`, `FINISHED`→`FINISHED`, etc.

**`fetchAllCompetitions` (`:61-63`) é um façade enganador** — o nome sugere multi-competição mas o corpo é `return this.fetchFromApi('WC')`. Só World Cup. Nunca chegou a ser expandido.

**`getFallbackMatches` (`:229-253`)** gera 11 jogos a partir de 24 equipas hardcoded, espaçados 24h a partir de `now`. `externalId` sintético `wc-{home}-{away}`.

⚠️ **Estes jogos fictícios são indistinguíveis dos reais na BD.** `syncMatches` insere-os e chama `generateOdds`. Resultado: um operador sem API key tem um sistema aparentemente funcional alimentado por dados inventados, e apostas reais de utilizadores são liquidadas contra resultados que nunca existem (ficam `SCHEDULED` para sempre → `allFinished = false` → nunca liquidam).

#### `syncMatches` (`:78-123`)

```typescript
for (const match of matches) {                    // filter: league contém "world cup" OU country === "World"
  const existing = await prisma.match.findUnique({ where: { externalId } });

  if (existing) {
    // actualiza APENAS 3 campos — nunca nome/equipa/data
    await prisma.match.update({ data: { homeScore, awayScore, status } });
    if (odds.length === 0) await this.generateOdds(existing.id);   // backfill só se zero
  } else {
    await prisma.match.create({ data: {...} });
    await this.generateOdds(newMatch.id);
  }
}
return matches.length;                              // ⚠️ devolve contagem de processados, não de inseridos
```

Observações:
- **N+1 severo**: 3 queries por match (`findUnique` + `update`/`create` + `findMany` odds), sequenciais, sem `$transaction` nem `createMany`. Para 64 jogos da WC = ~200 round-trips.
- **Idempotência de odds é só "se zero".** Depois da primeira geração, as odds de um match nunca mais são actualizadas por `syncMatches`. Só se actualizam via `applyScrapedOdds`.
- **`status` nunca regride** — se a API devolver `SCHEDULED` num match que localmente está `FINISHED` (ex.: re-sync de um jogo adiado), o estado é sobrescrito sem lógica de transição. Um `FINISHED` pode voltar a `SCHEDULED` e reabrir apostas.
- O filtro de `:80-82` redundante: `fetchFromApi('WC')` já devolve só WC.

#### `generateOdds` (`:176-227`) — os 11 mercados

Early-return se já existirem odds. Depois, `jitter()` = factor aleatório em `[0.97, 1.03]` multiplicado sobre a odd base.

| # | `market` | Seleções | Odds base |
|---|---|---|---|
| 1 | `1X2` | `1`/`X`/`2` | 1.90 / 3.50 / 3.80 |
| 2 | `DUPLA_HIPOTESE` | `1X`/`X2`/`12` | 1.30 / 1.80 / 1.25 |
| 3 | `MARCAS_0_5` | `Mais 0.5`/`Menos 0.5` | 1.08 / 9.50 |
| 4 | `MARCAS_1_5` | `Mais 1.5`/`Menos 1.5` | 1.35 / 3.20 |
| 5 | `MARCAS_2_5` | `Mais 2.5`/`Menos 2.5` | 1.85 / 1.95 |
| 6 | `MARCAS_3_5` | `Mais 3.5`/`Menos 3.5` | 2.60 / 1.50 |
| 7 | `MARCAS_4_5` | `Mais 4.5`/`Menos 4.5` | 3.40 / 1.30 |
| 8 | `AMBAS_MARCAM` | `Sim`/`Não` | 1.75 / 2.05 |
| 9 | `RESULTADO_INTERVALO` | `1`/`X`/`2` | 2.80 / 2.20 / 3.60 |
| 10 | `RESULTADO_CORRETO` | 9 scores | 5.50 … 12.00 |
| 11 | `IMPAR_PAR` | `Ímpar`/`Par` | 1.90 / 1.90 |

Total: **33 linhas** de odds por match, todas com `source: 'estimated'`. Written via `prisma.odds.createMany`.

⚠️ **As odds não têm overround.** Somando 1/1.90 + 1/3.50 + 1/3.80 = 0.526 + 0.286 + 0.263 = **1.075** ⇒ 7.5% de margem embutida no 1X2. Isto é correcto e intencional para uma casa. Mas o **`IMPAR_PAR` está a 1.90/1.90 = 1.052 (5.2% de margem)** e as odds são **idênticas para todos os modelos** independentemente das equipas. Odds de `MARCAS_0_5` "Menos 0.5" a 9.50 é matematicamente absurdo (0 golos é常见). A "margem" não é um modelo de preço, é um número decorativo.

⚠️ **`RESULTADO_CORRETO` só cobre 9 scores**, e a lista é arbitrária: `1-0, 2-0, 2-1, 0-0, 1-1, 2-2, 0-1, 0-2, 1-2`. Faltam `3-0`, `3-1`, `0-3`, `1-3`, `2-3`, `3-2`, `3-3` — incluindo o **1X2-impossível `0-0` listado a 9.00** e `3-3` (empate) completamente ausente. Um resultado de 3-3 liquida o bet como **LOST** (default do switch).

#### `applyScrapedOdds` (`:255-311`) — o caminho "inteligente"

Pipeline Python (`scraper.py`) → `odds.json` → esta função.

1. Lê `join(__dirname, '../../odds.json')`. Se não existir, retorna 0.
2. Para cada item, tenta match por `homeTeam`+`awayTeam` exactos.
3. **Fallback de matching:** primeiras 2 palavras de cada nome em `contains` (`homeParts`/`awayParts`, `:271-278`). Frágil: "South Korea" → "South Korea", mas "United States" vs "USA" nunca faz match. E `contains` sem ordem pode cruzar jogos.
4. `deleteMany` de todas as odds do match e `createMany` das novas com `source: 'oddspedia'`.
5. `updated++` conta matches processados.

⚠️ **`deleteMany` + `createMany` não está numa transação.** Se o `createMany` falhar, o match fica **sem odds** — e como `generateOdds` faz early-return em `length > 0`, uma re-sync não regenera. O match torna-se apostável=false para sempre.
⚠️ **O `@@unique([matchId, market, selection])` pode rebentar** se `allOdds` tiver chaves duplicadas.
⚠️ `prisma.odds.deleteMany` **não apaga `BetSelection`** — apostas já feitas mantêm o `odds` snapshot (correcto) mas o `Odds` row desaparece (aceitável).

#### O motor Poisson (`apps/api/odds_engine.py`) — 164 linhas, **nunca chamado pelo backend**

Este é o componente mais sofisticado do repositório, e está **completamente desligado da aplicação**:

- `poisson_pmf(k, lam)`, `poisson_matrix(home_xg, away_xg, max_goals=7)`
- `xg_from_odds()` — **grid search** de 35×32 = 1120 candidatos para minimizar `Σ(Poisson - market)²`
- `apply_margin(probabilities, margin=0.05)`
- `generate_all_odds(odds1, oddsX, odds2)` — deriva **todos** os mercados de uma matriz de scorelines

Mercados que o Python produz e o TS não: `HANDICAP_{n1_5, n0_5, 0_0, 0_5, 1_5}` e `GOLOS_{0..6}`. E produz `RESULTADO_CORRETO` com os **top-12 scores** (dinâmico, filtrado por `> 0.005`), não os 9 fixos.

**Só o `scraper.py` o invoca** (linha 10: `from odds_engine import generate_all_odds`). O backend consome o `odds.json` resultante, mas **só se um operador correr `python apps/api/scraper.py` manualmente** — instrução que está hardcoded na UI admin (`Admin.tsx:251`).

> **O motor de liquidação TS suporta 22 mercados. O gerador TS produz 11. O gerador Python produz ~24. Os três conjuntos não coincidem.** A §3.3 detalha o impacto.

### 3.2 `bet.service.ts` — `placeBet` (`:7-83`)

#### Validação Zod (`config/env.ts:32-39`)

```typescript
placeBetSchema = z.object({
  stake: z.number().min(1).max(10000),          // ← .number(), NÃO .coerce.number()
  selections: z.array(z.object({
    matchId: z.string(), market: z.string(), selection: z.string(),
  })).min(1).max(20),
});
```

⚠️ **Duas implicações:**
1. `selections` **não valida `odds`** — apesar de o `BetSelection` interface (`bet.service.ts:11`) declarar `odds: number` e de `BetSlip.tsx:24` o enviar. Correcto por desenho (o servidor ignora-o), mas o tipo é enganador.
2. `z.number()` sem coerce rejeita `"10"` (string). O `BetSlip` envia `stake` de `useState<number>`, portanto OK — mas qualquer cliente que envie string recebe 400.

#### Fluxo passo-a-passo

**Fase 1 — Verificação pré-transaction (fora de `$transaction`, N+1)**
```
para cada selection:
  match = findUnique(matchId)                    → !match ? throw "Match not found"
  status !== 'SCHEDULED' ? throw                  → "…não está disponível para apostas"
  matchDate <= now() ? throw                     → "…já começou — apostas encerradas"
  dbOdd = odds.findFirst(matchId+market+selection) → !dbOdd ? throw "Odds not found"
  lockedSelections.push({ ..., odds: Number(dbOdd.value) })   ← ODDS TRAVADAS DA BD
```

✅ **A segurança está correcta aqui.** O campo `odds` do request é completamente ignorado; o valor gravado vem sempre de `prisma.odds`. Um cliente não pode manipular odds. (Confirmado em `AGENTS.md:76`.)

⚠️ Mas o N+1 é real: `2N` queries sequenciais **antes** da transação. Com o `.max(20)`, até 40 queries. E a verificação de `status`/`matchDate` é feita **fora** da transação — há uma TOCTOU window entre a leitura e o `decrement`. Na prática `matchDate` é o invariante que protege, e a transação serializa o decrement, então o risco é baixo.

**Fase 2 — Deduplicação (`:39-44`)**
```typescript
const key = `${s.matchId}-${s.market}`;
if (seen.has(key)) throw new Error(`Duplicate selection: ${s.market} on match ${s.matchId}`);
```
⚠️ A chave é `matchId-market`, **ignora `selection`**. forbidding uma segunda escolha do mesmo mercado no mesmo jogo — correcto para 1X2 e Handicap, mas para `RESULTADO_CORRETO` e `GOLOS_N` o utilizador não pode combinar opções. Coerente com a regra do store Zustand, pelo menos.
⚠️ A concatenação com `-` é ambígua se ids contiverem `-` (não contêm — são cuids), mas o separador de mercado usa `_`, o que torna a colisão impossível na prática. OK.

**Fase 3 — Cálculo (`:46-47`)**
```typescript
const totalOdds       = lockedSelections.reduce((acc, s) => acc * s.odds, 1);  // produto
const potentialReturn = stake * totalOdds;
```
Multiplicador puro, **sem margem da casa** — a margem já está nas odds individuais.

⚠️ **Precisão de `Decimal` com `float`.** O `reduce` opera em `number` (IEEE 754 double), não em Decimal. Com 20 selecções a 1.90, o produto tem arredondamento acumulado. O `Math.round(totalOdds * 100) / 100` (`:65`) mascara a 2 casas no resultado final, mas o valor gravado em `BetSelection.odds` é o raw. Aceitável para créditos virtuais, não para dinheiro real.

**Fase 4 — Transacção (`:49-78`)**

```typescript
await prisma.$transaction(async (tx) => {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user)            throw new Error('Utilizador não encontrado');
  if (user.isBlocked)  throw new Error('Conta bloqueada');
  if (stake <= 0)      throw new Error('Stake deve ser superior a 0');
  if (Number(user.balance) < stake) throw new Error('Saldo insuficiente');

  await tx.user.update({
    where: { id: userId, balance: { gte: stake } },   // ← guarda extra, atómica
    data: { balance: { decrement: stake } },
  });

  return tx.bet.create({
    data: { userId, stake, totalOdds: rounded, potentialReturn: rounded,
      selections: { create: lockedSelections.map(...) } },   // nested create
    include: { selections: { include: { match: true } } },
  });
});
```

✅ **A guarda `balance: { gte: stake }` no `where` é o ponto crítico e está bem feito.** É uma condição atómica ao nível do Prisma/Postgres: se outro pedido concorrente consumir o saldo entretanto, o `UPDATE` faz match a 0 linhas e o Prisma lança `P2025`. O `findUnique`+check anterior é apenas para dar mensagem de erro amigável; a garantia real é o `where` composto. Correcto.

⚠️ **A transacção não está isolada em `Serializable`.** O default do Postgres é `ReadCommitted`. Duas apostas concorrentes com saldo exacto: ambas passam o `findUnique`, uma ganha o `UPDATE` condicional, a outra recebe `P2025` — que **não é apanhado**, sobe como erro 500 genérico em vez de "Saldo insuficiente". Funcionalmente seguro (o dinheiro nunca é criado do nada), mas o UX degrada.

⚠️ **Notificação fora da transacção (`:80`).** `notificationService.create()` usa o `prisma` global, não `tx`. Se falhar, a aposta **já foi criada e cobrada** mas o `await` rejeita → o route devolve 400. O utilizador vê "Erro ao colocar aposta" com a aposta deduzida e o bilhete limpo. **Este é o bug de UX mais grave que encontrei.**

**Fase 5 — Cancelamento (`:129-148`)**
```typescript
if (bet.userId !== userId) throw;
if (bet.status !== 'PENDING') throw;
await tx.user.update({ where: { id: userId }, data: { balance: { increment: bet.stake } } });
return tx.bet.update({ where: { id: betId }, data: { status: 'CANCELLED' } });
```
✅ Transaccional e correcto. ⚠️ Mas `settledAt` **não** é preenchido no cancelamento, ao contrário das liquidações — inconsistência de auditoria.
⚠️ **Race com a liquidação:** ambos verificam `status === 'PENDING'` dentro de transacções separadas. Em `ReadCommitted`, o cancel e o settle podem ambos passar a verificação e ambosem modificar a mesma aposta. O `tx.bet.update` sem `where: { status: 'PENDING' }` não previne o double-spend. **Cenário concreto: o cron de settle corre enquanto o utilizador cancela → o utilizador recebe o stake de volta E o payout.** Existe mitigação parcial: `settlePendingBets` só toca em apostas cujas selecções estão todas `FINISHED`, o que torna a janela estreita mas não inexistente (a transição para `FINISHED` ocorre no mesmo instante que o sync corre).

### 3.3 Liquidação — `betService.settlePendingBets()` (`:150-248`)

**Uma única transacção envolve TODAS as apostas pendentes.** `prisma.$transaction(async (tx) => { ... })` sem `timeout` explícito ⇒ default do Prisma **5000ms**. Ver §3.4.

#### Algoritmo por aposta

```
anyLost = false;  anyVoid = false;  allFinished = true

para cada selection:
  match = selection.match
  ├─ status ∈ {POSTPONED, CANCELLED} ──► anyVoid=true; won←null; continue
  ├─ status ≠ FINISHED ────────────────► allFinished=false; continue
  └─ status = FINISHED:
       won = checkSelectionWon(market, selection, match)
       won === null ? (anyVoid=true; won←null) : (won←won)
       won === false ? anyLost=true : void

SE anyLost:                       → status=LOST,     profit -= stake,  notificar BET_LOST
SE !allFinished:                  → (skip, fica PENDING)
SE anyVoid:                       → status=CANCELLED, balance += stake, notificar BET_CANCELLED
SENÃO (todas won):                → status=WON, balance += potentialReturn, profit += (potentialReturn - stake), notificar BET_WON
```

**Precedência correcta:** `anyLost` é avaliado **antes** de `!allFinished` e `anyVoid`. Numa aposta com uma selecção perdida e outra ainda por jogar, liquida imediatamente como LOST. É a política correcta para apostas múltiplas (não faz sentido esperar).

⚠️ **A ordem `if (anyLost)` → `if (!allFinished)` → `if (anyVoid)`** tem um bug de estado: quando `anyVoid` fica true e `allFinished` fica false (ex.: uma selecção adiada + outra ainda por começar), a aposta fica `PENDING` para sempre com a selecção adiada marcada `won: null`. Se a outra nunca começar, nunca liquida. Aceitável-ish, mas o estado é inconsistente.

⚠️ **`HANDICAP_0_0` retorna `null` incondicionalmente** (`bet.service.ts:313-314`) — isto é, **uma aposta de handicap 0 é sempre tratada como void e integralmente reembolsada**, nunca avaliada. Combinado com o facto de `generateOdds` **não gerar** mercados `HANDICAP_*` (só o `odds.json` do Python os tem), isto só é alcançável após um `applyScrapedOdds`. Ainda assim é um mercado que o sistema aceitaCHF e devolve dinheiro.

#### ⚠️ CRÍTICO — A liquidação chama `notificationService.create()` DENTRO da transacção

`bet.service.ts:213, 228, 245` chamam `notificationService.create(...)`, que por sua vez usa o **`prisma` global** (`notification.service.ts:5`), **não `tx`**.

Isto significa que cada notificação de liquidação:
- abre uma **nova conexão do pool** (ou re-utiliza uma do pool, mas **fora da transacção**)
- executa um `INSERT` **autocommit** — **visível imediatamente**, mesmo que a transacção do `settlePendingBets` faça rollback a seguir
- se a transacção global faz rollback, **as notificações ficam órfãs**: o utilizador recebe "Ganhaste 500 CR!" e nunca recebeu os créditos.

Combinado com o timeout de 5s (§3.4), isto é uma fonte real de incoerência visível ao utilizador.

#### `checkSelectionWon` (`:250-339`) — os 22 mercados

Guarda inicial: `homeScore === null || awayScore === null → return false` (não `null`). Isto significa que um `FINISHED` sem scores marca a selecção como **perdida**, não void. Raro (a API sempre traz scores em FINISHED), mas o comportamento é Surpreendente.

| Mercado | Lógica | Tipo |
|---|---|---|
| `1X2` | `1`: home>away · `X`: home==away · `2`: away>home | exacto |
| `DUPLA_HIPOTESE` | `1X`: home>=away · `X2`: away>=home · `12`: home!==away | exacto |
| `MARCAS_0_5` … `MARCAS_4_5` | `Mais L`: total>L · `Menos L`: **total<L** | ⚠️ ver abaixo |
| `AMBAS_MARCAM` | `Sim`: home>0 && away>0 · `Não`: home==0 \|\| away==0 | exacto |
| `RESULTADO_CORRETO` | `${home}-${away} === selection` | exacto |
| `RESULTADO_INTERVALO` | idem 1X2 mas sobre `halfTimeHome/Away` | exacto |
| `HANDICAP_n1_5` | `Casa`: (home−1.5)>away · `Fora`: (away−1.5)>home | ⚠️ simplificado |
| `HANDICAP_n0_5` | (home−0.5)>away / (away−0.5)>home | ⚠️ simplificado |
| `HANDICAP_0_0` | — | **sempre `null` (void)** |
| `HANDICAP_0_5` | (home+0.5)>away / (away+0.5)>home | ⚠️ simplificado |
| `HANDICAP_1_5` | (home+1.5)>away / (away+1.5)>home | ⚠️ simplificado |
| `IMPAR_PAR` | `Ímpar`: total%2===1 · `Par`: total%2===0 | exacto |
| `GOLOS_0` … `GOLOS_6` | `total === parseInt(market.split('_').pop())` | exacto |

**Contagem: 8 market families, 22 `case` labels, 33 condições de selecção.**

**Bugs de mercado encontrados:**

1. **Empate em `MARCAS_*` é sempre perdido.** `total < 0.5` para 0-0: `0 < 0.5` = true, ganha "Menos 0.5" ✓. Mas `Menos 1.5` com total=1: `1 < 1.5` = true ✓. O problema é o **linha de meio-gol**: nunca existe em futebol, logo `.5` é seguro. ✅ **Na verdade este mercado está correcto** — a linha `.5` existe precisamente para eliminar push. Corrijo a minha leitura: **Over/Under está bem implementado.**

2. **Handicap não trata empates (push).** A handicapping real exige: se `home + hc == away` com `hc = ±0.5` isso é impossível, mas o código compara `(home+0.5) > away` o que é **matematicamente equivalente** e correcto. ✅ Correcto.

3. **`RESULTADO_CORRETO` com scores fora dos 9 gerados.** Como `generateOdds` só cria 9 scores, e o Poisson cria top-12, um score como `3-3` pode existir em `Odds` e ser apostável — mas o switch compara strings e funciona para **qualquer** score. ✅ Funciona. O problema é o inverso: o gerador TS cria `0-0` a 9.00, e `IMPAR_PAR` cobre o resto. Coerente.

4. **Mercados sem handler → `default: return false`.** `checkSelectionWon` é `false`, não `null`. Portanto qualquer mercado não reconhecido (ex.: um `allOdds` novo do Python, ou `MARCAS_5_5` que o Poisson gera mas o switch não tem) **liquida como PERDIDA silenciosamente**. ⚠️ **Este é o bug de maior impacto do motor.** Ver a tabela de confronto abaixo.

#### ⚠️ Confronto: o que é GERADO vs. o que é AVALIÁVEL

| Mercado | `generateOdds` (TS) | `odds_engine.py` | `checkSelectionWon` | Risco |
|---|:---:|:---:|:---:|---|
| `1X2` | ✅ | ✅ | ✅ | — |
| `DUPLA_HIPOTESE` | ✅ | ✅ | ✅ | — |
| `MARCAS_0_5`–`4_5` | ✅ | ✅ | ✅ | — |
| `AMBAS_MARCAM` | ✅ | ✅ | ✅ | — |
| `IMPAR_PAR` | ✅ | ✅ | ✅ | — |
| `RESULTADO_CORRETO` | ✅ (9 fixos) | ✅ (top-12) | ✅ (qualquer) | cobertura desigual |
| `RESULTADO_INTERVALO` | ✅ | ✅ | ✅ | ⚠️ depende de half-time |
| `HANDICAP_n1_5` | ❌ | ✅ | ✅ | ok |
| `HANDICAP_n0_5` | ❌ | ✅ | ✅ | ok |
| `HANDICAP_0_0` | ❌ | ✅ | ⚠️ sempre void | **perda garantida p/ o user** |
| `HANDICAP_0_5` | ❌ | ✅ | ✅ | ok |
| `HANDICAP_1_5` | ❌ | ✅ | ✅ | ok |
| `GOLOS_0`–`GOLOS_6` | ❌ | ✅ | ✅ | ok |
| `MARCAS_5_5`+ | ❌ | ✅ (loop 0.5–4.5 = não) | ❌ | — |

O `applyScrapedOdds` insere **tudo** o que o Python gerou, incluindo `HANDICAP_0_0`. Um utilizador aposta nesse mercado (o `MatchDetail.tsx:19-23` mostra-o com label "Handicap 0"), a aposta é aceite e cotada, e no settle recebe **reembolso integral**. O frontend tem label para todos os mercados, incluindo os 7 que o gerador TS não produz.

**`RESULTADO_INTERVALO` merece nota:** `mapStatus` e o sync de `match.service.ts` **nunca escrevem `halfTimeHome`/`halfTimeAway`**. Só existem se inseridos manualmente. Na prática, `checkSelectionWon:300-301` retorna `false` ⇒ **todas as apostas ao intervalo perdem**. E `generateOdds` **inclui `RESULTADO_INTERVALO` como mercado nº 9 cotado**! ⚠️ **Este é um bug de produto confirmado:** o sistema anuncia e aceita apostas "Resultado Intervalo" que estão garantidas para perder.

### 3.4 ⚠️ CRÍTICO — `$transaction` global com timeout de 5 segundos

```typescript
// bet.service.ts:151
await prisma.$transaction(async (tx) => {
  const pendingBets = await tx.bet.findMany({ ... });    // ← carrega TODAS as pendentes
  for (const bet of pendingBets) {
    for (const selection of bet.selections) {            // ← 2 queries por selecção
      await tx.betSelection.update({ ... });
    }
    await tx.bet.update({ ... });                         // + user.update
  }
});
```

- **Sem `timeout` explícito** ⇒ Prisma default **5000 ms**.
- **Sem `batchSize`/`take`** ⇒ carrega todas as apostas PENDING do sistema de uma vez.
- **Complexidade:** `O(total_selecções_pendentes)` queries, sequenciais, dentro de uma transacção com limite de 5s.
- 100 apostas × 3 selecções = 300+ queries. A 20ms cada = 6s. **Excede o timeout.**
- Ao exceder: rollback de tudo (correcto para o dinheiro), **mas** as notificações já inseridas fora da transacção permanecem (§3.3).

⚠️ **Não há `settledAt IS NULL` guard, `SKIP LOCKED`, nem processamento incremental.** O job é O(n) sobre o backlog inteiro a cada invocação. Num sistema com viele utilizadores isto degrada de forma monótona e, no limite, nunca completa.

⚠️ **Sem timeout no `betService.settlePendingBets()` quando chamado via admin** (`bet.routes.ts:68`) — o HTTP request fica pendurado até o Prisma abortar aos 5s.

### 3.5 Outros serviços

#### `auth.service.ts`
- `register` (`:7-34`): `findUnique` por email → `bcrypt.hash(pw, 12)` → create → JWT `{ userId, role }` com `expiresIn: env.JWT_EXPIRES_IN`. Devolve `{ token, user }` com `balance` convertido.
  ⚠️ **Race no check-then-create:** dois registos simultâneos do mesmo email passam ambos o `findUnique`; um falha com P2002 (violação unique) e a route devolve 400 com a mensagem crua do Prisma. Funciona, mas a mensagem é feia.
  ⚠️ `register` **não verifica `isBlocked`** (o `login` verifica, `:42-44`). Um utilizador bloqueado pode criar contas novas com o mesmo email? Não — email é unique. OK.
- `login` (`:36-67`): findUnique → `isBlocked` check → `bcrypt.compare` → JWT.
  ⚠️ **Não há mensagem de erro diferenciada para "email não existe" vs "password errada"** — ambos `'Invalid credentials'`. ✅ Correcto (anti-enumeração).
- ⚠️ **Sem rate limiting por IP/email no service** — depende do `express-rate-limit` global (10 req/15min em `/api/auth/login` e `/register`, `index.ts:50-56`). Cumprido.

#### `user.service.ts`
- `getProfile` (`:6-29`): select explícito (não expõe `passwordHash`) ✅, converte Decimals para number.
- `updateProfile` (`:31-50`): check de email duplicado com `NOT: { id: userId }` ✅, depois `prisma.user.update({ data })` — ⚠️ **`data` é passada directamente do `req.body` após Zod.** O `updateProfileSchema` só define `name` e `email`, e o Zod `object()` **remove chaves desconhecidas por default**, portanto `role`/`balance` não passam. ✅ Correcto, mas por coincidência do comportamento do Zod, não por allowlist explícito.
- `changePassword` (`:52-68`): `bcrypt.compare` → length check → `bcrypt.hash(newPassword, 12)`.
  ⚠️ **Sem rate limiting e sem verificação de password actual antes de… não, verifica.** Mas: um utilizador com sessão activa (JWT de 7 dias) que comprometa o token pode mudar a password sem o password actual —mitigação recomendada: revogar tokens. **Não há blacklist de tokens nem refresh tokens** (ver §4.3).
- `updateBalance` (`:70-76`) e **`updateStats` (`:78-107`): AMBOS NUNCA SÃO CHAMADOS.** Confirmado por grep — as únicas referências são as definições.
  ⚠️ **Consequência crítica, ver §3.6.**

#### `group.service.ts`
- `generateUniqueCode()` (`:4-13`): `crypto.randomBytes(4).toString('hex').toUpperCase()` = **8 chars hex**, loop até não existir. Bónus: o espaço de busca é 16^8 = 4.3 mil milhões, e o loop é verificadamente correcto.
- `create` (`:20-40`): cria grupo + `members: { create: { userId: adminId } }` — o criador é automaticamente membro ✅.
- `join` (`:42-73`): lookup por `inviteCode` → check `alreadyMember` → **check `members.length >= 50`** → create.
  ⚠️ **O limite de 50 é aplicado em JS, não na BD.** Duas entradas simultâneas com o mesmo código podem ambas ver 49 membros e ambas entrar → 51. `@@unique([groupId, userId])` impede duplicatas do mesmo user, não o over-cap.
- `getById` (`:89-117`): `groupMember.findUnique({ groupId_userId })` — **verificação de membership** ✅ → depois carrega membros ordenados por `user.balance: 'desc'`.
- `delete` (`:119-125`): check `group.adminId !== userId` → delete. ⚠️ **Não remove o admin da lista de membros** — a Cascade do `GroupMember` trata. ✅
- `mapMemberBalance` (`:15-17`): helper genérico para converter Decimals.

#### `ranking.service.ts`
- `getGlobal` (`:4-24`): `findMany` orderBy `balance desc`, take 50. **Qualquer utilizador vê o ranking global completo — nomes, emails não (não é seleccionado), saldos, profits, ROI.** ⚠️ `take: 50` fixo, sem paginação.
- `getGroup` (`:26-57`): membership check ✅ → depois `.sort()` **em JS** em vez de `orderBy` na BD. Funcional, ineficiente.

#### `notification.service.ts`
- `create`, `listByUser` (take 50 fixo), `markRead` (**ownership check explícito** `:24-28` ✅), `markAllRead`, `getUnreadCount`.
- ⚠️ `listByUser` **não tem paginação** e devolve sempre as 50 mais recentes. Notificações antigas são inalcançáveis pela UI.

### 3.6 ⚠️ CRÍTICO — `betsCount`, `betsWon` e `roi` nunca são actualizados

Este é o bug de maior impacto funcional do sistema.

**O que `settlePendingBets` faz** (`bet.service.ts:203-245`):
- LOST: `tx.user.update({ data: { profit: { increment: -stake } } })` ← **só `profit`**
- WON: `tx.user.update({ data: { balance: { increment: potentialReturn } } })` + `tx.user.update({ data: { profit: { increment: profit } } })` ← **só `balance` e `profit`**
- CANCELLED: `tx.user.update({ data: { balance: { increment: stake } } })` ← **só `balance`**

**O que nunca acontece:** `betsCount` e `betsWon` nunca são incrementados. E `roi` — que tem uma coluna própria — **nunca é recalculado em lado nenhum**, excepto dentro de `userService.updateStats()`, **que nunca é chamado**.

**Efeito em cascata na UI:**

| Ecrã | Ficheiro | O que mostra | Realidade |
|---|---|---|---|
| Dashboard — "Apostas" | `Dashboard.tsx:117` | `user.betsCount` | **sempre 0** |
| Dashboard — "Vitórias" | `Dashboard.tsx:122` | `user.betsWon` | **sempre 0** |
| Dashboard — "Derrotas" | `Dashboard.tsx:127` | `betsCount - betsWon` | **sempre 0** |
| Dashboard — "Win Rate" | `Dashboard.tsx:69` | `betsWon/betsCount` | **0% sempre** |
| Statistics — 5 cartões | `Statistics.tsx:14-40` | winRate, betsCount, betsWon, derrotas | **todos 0** |
| Rankings — coluna "Apostas" | `Rankings.tsx:87` | `player.betsCount` | **sempre 0** |
| Admin — tabela utilizadores | `Admin.tsx` | betsCount/betsWon | **sempre 0** |

**O que funciona:** `balance` ✅ (correcto), `profit` ✅ (correcto, é `increment`ido em cada settle), e por isso o **Lucro** e o **ROI… não**: o `roi` mostrado em `Statistics.tsx:26` e `Rankings.tsx:86` vem da coluna `user.roi`, que é 0 para sempre. A barra de "Lucro Total" e o valor em `Dashboard.tsx:97` estão correctos.

**Conclusão:** os ecrãs de estatísticas e metade do leaderboard estão **permanentemente zerados**, independentemente de quantas apostas o utilizador faça. Isto contradiz directamente o objectivo do produto ("ranking entre amigos") — o leaderboard ordena por `balance`, que funciona, mas as estatísticas de acerto são inúteis.

A correção seria chamar `userService.updateStats(userId, won, profit, stake)` dentro do `settlePendingBets` transaccional — mas isso **não pode** ser feito com o `prisma` global que `userService` usa; teria de ser reescrito contra `tx`.

### 3.7 Testes (`apps/api/tests/`)

⚠️ **`apps/api/tests/bet-logic.test.ts` não testa o código de produção.** Linhas 3-4 do ficheiro admitem-no explicitamente:
> *"We import checkSelectionWon indirectly by reconstructing the logic since the service requires prisma."*

O ficheiro define uma **cópia local** de `checkSelectionWon` (linhas 5-55) e testa essa cópia. Há **duas implementações divergentes** da mesma função no repositório:
- A cópia de teste: 8 cases, sem `HANDICAP_*`, com `GOLOS_2` hardcoded.
- A real (`bet.service.ts:250-339`): 22 cases.

**Consequência:** os testes passam verdes enquanto a produção pode ter os bugs que os testes não cobrem. É o pior tipo de teste — verde e inútil. `import { betService } from '../src/services/bet.service'` funcionaria perfeitamente num ambiente de teste, já que importar o módulo não executa queries (a instância `prisma` só é criada, não conectada).

`env.test.ts` (79 linhas) e `schemas.test.ts` (42 linhas) testam os schemas Zod reais — **estes são válidos** e importam de `../src/config/env` directamente.

Frontend: `hooks.test.ts` verifica apenas que os hooks são funções exportadas. `localStorage.test.ts` testa **o mock de localStorage, não a aplicação**. Cobertura effectively zero no frontend.

⚠️ **`AGENTS.md:32` diz: *"No test framework is configured. No `test` script exists in any `package.json`. No test files found."*** — **isto está errado.** Existem vitest em ambas as apps, scripts `test`/`test:watch`, 5 ficheiros de teste, e `turbo test` no root. A documentação do AGENTS.md está desactualizada em vários pontos (§0).

---

## 4. ROTAS E MATRIZ DE PERMISSÕES

### 4.1 Montagem (`index.ts`)

```
helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false })   :36-39
cors({ origin: env.FRONTEND_URL, credentials: true })                       :40
express.json({ limit: '1mb' })                                               :41
rateLimit 200/15min  → /api/                                                :43-48
rateLimit  10/15min  → /api/auth/login, /api/auth/register                  :50-56
[rotas cron]                                                               :62-92
/api/auth    → authRoutes        /api/users    → userRoutes                  :94-101
/api/groups  → groupRoutes       /api/matches  → matchRoutes
/api/bets    → betRoutes         /api/rankings → rankingRoutes
/api/notifications → notificationRoutes    /api/admin → adminRoutes
/api/docs    → swagger-ui                                                    :103
/api/health                                                                 :104-106
static web/dist + SPA fallback                                               :109-117
error handler global                                                        :120-123
```

⚠️ **`contentSecurityPolicy: false`** está desligado. Numa app que serve um PWA com `service worker` e faz `innerHTML` mínimo, desligar CSP remove uma camada de defesa. Dado que `bet-700` etc. são classes Tailwind e não há `dangerouslySetInnerHTML` no código, o risco é limitado — mas é uma desactivar deliberada de protecção.

⚠️ **O rate limiter general de 200/15min aplica-se a `/api/`** — o path `'/api/'` com Express match é prefix-match, logo cobre todos os sub-routers. ⚠️ **Mas `/api/docs` (swagger UI) também é rate-limited** e `/api/health` — um health check a cada 30s de um monitor = 30 requests/15min, consumindo quota sem necessidade. Porque o limiter está montado **antes** dos routers, e `match.routes.ts:40` `POST /api/matches/sync` partilha a mesma janela de 200 com todo o resto.

### 4.2 Matriz completa de endpoints

**28 endpoints.** Legenda: 🔓 público · 🔒 JWT · ⛔ JWT+ADMIN

#### Auth — `auth.routes.ts` (mount `/api/auth`)
| Método | Path | Auth | Body / Params | Sucesso | Erro |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | 🔓 | `{name: 2-50, email, password: 6-100}` | 201 `{token, user}` | 400 |
| POST | `/api/auth/login` | 🔓 | `{email, password: ≥1}` | 200 `{token, user}` | 401 |

#### Users — `user.routes.ts` (mount `/api/users`)
| Método | Path | Auth | Body | Sucesso | Erro |
|---|---|---|---|---|---|
| GET | `/api/users/me` | 🔒 | — | 200 perfil | 404 |
| PATCH | `/api/users/me` | 🔒 | `{name?, email?}` | 200 | 400 |
| POST | `/api/users/change-password` | 🔒 | `{currentPassword ≥1, newPassword 6-100}` | 200 `{message}` | 400 |

#### Matches — `match.routes.ts` (mount `/api/matches`)
| Método | Path | Auth | Query | Sucesso |
|---|---|---|---|---|
| GET | `/api/matches` | 🔒 | `limit ≤100, cursor` | 200 `{items, nextCursor}` |
| GET | `/api/matches/live` | 🔒 | — | 200 array |
| GET | `/api/matches/:id` | 🔒 | — | 200 match+odds |
| POST | `/api/matches/sync` | ⛔ | — | 200 `{message}` |
| POST | `/api/matches/sync-odds` | ⛔ | — | 200 `{message}` |

#### Bets — `bet.routes.ts` (mount `/api/bets`)
| Método | Path | Auth | Body / Query | Sucesso |
|---|---|---|---|---|
| POST | `/api/bets` | 🔒 | `placeBetSchema` | 201 bet+selections |
| GET | `/api/bets` | 🔒 | `status?, cursor?, limit?` | 200 `{items, nextCursor}` |
| GET | `/api/bets/active` | 🔒 | `cursor?, limit?` | 200 (força PENDING) |
| GET | `/api/bets/:id` | 🔒 | — | 200 (owner **ou** ADMIN) |
| POST | `/api/bets/:id/cancel` | 🔒 | — | 200 (owner) |
| POST | `/api/bets/settle` | ⛔ | — | 200 `{message}` |

⚠️ **`bet.routes.ts:60`** — o catch do `POST /:id/cancel` retorna a string **"Erro ao colocar aposta"** (copiado do handler de `placeBet`). Erro de copy-paste; o `throw new Error('Not your bet')` é engolido e substituído por esta mensagem sem relação.

⚠️ **Ordem de rotas em `bet.routes.ts`:** `GET /:id` (linha 45) está **antes** de `POST /settle` (linha 66). Como o `POST /settle` só faz match em `POST` e `GET /:id` só em `GET`, não há colisão prática. Mas `GET /bets/settle` cairia em `GET /:id` e devolveria 404. Inofensivo, frágil.

#### Groups — `group.routes.ts` (mount `/api/groups`)
| Método | Path | Auth | Body | Sucesso |
|---|---|---|---|---|
| POST | `/api/groups` | 🔒 | `{name: 2-50}` | 201 grupo+membros |
| POST | `/api/groups/join` | 🔒 | `{inviteCode: 8 chars}` | 200 grupo |
| GET | `/api/groups` | 🔒 | — | 200 array |
| GET | `/api/groups/:id` | 🔒 | — | 200 (membro apenas) |
| DELETE | `/api/groups/:id` | 🔒 | — | 200 (group-admin apenas) |

#### Rankings — `ranking.routes.ts` (mount `/api/rankings`)
| Método | Path | Auth | Sucesso |
|---|---|---|---|
| GET | `/api/rankings/global` | 🔒 | 200 array (50, **qualquer utilizador**) |
| GET | `/api/rankings/group/:id` | 🔒 | 200 array (membro apenas) |

#### Notifications — `notification.routes.ts` (mount `/api/notifications`)
| Método | Path | Auth | Sucesso |
|---|---|---|---|
| GET | `/api/notifications` | 🔒 | 200 array (50, sem paginação) |
| GET | `/api/notifications/unread-count` | 🔒 | 200 `{count}` |
| PATCH | `/api/notifications/:id/read` | 🔒 | 200 (owner apenas) |
| POST | `/api/notifications/read-all` | 🔒 | 200 |

#### Admin — `admin.routes.ts` (mount `/api/admin`)
| Método | Path | Auth | Body | Sucesso |
|---|---|---|---|---|
| GET | `/api/admin/stats` | ⛔ | — | 200 `{totalUsers, totalBets, totalGroups, pendingBets, totalWon, totalLost}` |
| GET | `/api/admin/users` | ⛔ | `page` | 200 `{users, total, page, totalPages}` |
| POST | `/api/admin/users` | ⛔ | `{name, email, password, balance? ≤1e6}` | 201 user |
| PATCH | `/api/admin/users/:id` | ⛔ | `{balance?, isBlocked?, role?}` + ≥1 campo | 200 user |
| DELETE | `/api/admin/users/:id` | ⛔ | — | 200 `{message}` |
| GET | `/api/admin/groups` | ⛔ | — | 200 array |
| DELETE | `/api/admin/groups/:id` | ⛔ | — | 200 `{message}` |

#### Cron — `index.ts` (inline, não num router)
| Método | Path | Auth | Sucesso |
|---|---|---|---|
| GET | `/api/cron/sync` | 🔑 `Bearer ${CRON_SECRET}` | 200 `{ok, synced}` / 409 se já a correr |
| GET | `/api/cron/settle` | 🔑 `Bearer ${CRON_SECRET}` | 200 `{ok}` / 409 |

#### Sistema
| Método | Path | Auth | Sucesso |
|---|---|---|---|
| GET | `/api/health` | 🔓 | 200 `{status, timestamp}` |
| GET | `/api/docs` | 🔓 | swagger-ui |

### 4.3 Controlo de acesso — análise de solidez

**`authenticate` (`middleware/auth.ts:10-25`):**
```typescript
const token = req.headers.authorization?.replace('Bearer ', '');
if (!token) return res.status(401)...
const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string; role: string };
req.userId = decoded.userId;
req.userRole = decoded.role;
```

⚠️ **`.replace('Bearer ', '')` em vez de `.startsWith()` + slice.** Aceita `Authorization: xxxBearer yyy` (remove a primeira ocorrência em qualquer posição). Mais importante: **`Authorization: Bearer <válido>` funciona, mas o token não é re-verificado contra a BD.** Um token válido continua válido mesmo depois de:
- o utilizador mudar a password
- o admin bloquear a conta (`isBlocked`)
- o admin mudar o `role` (de ADMIN para USER)

⚠️ **Consequência de segurança concrete:** um ADMIN que é despromovido a USER **mantém acesso admin completo até o token expirar (7 dias por default)**. O `PATCH /api/admin/users/:id` aceita `role`, mas o token já emitido transporta o role antigo — `requireAdmin` lê `req.userRole` do JWT, não da BD. **Isto é um escalonamento de privilégios persistente.**

⚠️ **`requireAdmin` (`:27-32`) confia em `req.userRole`** — correcto *se* `authenticate` correu primeiro. ✅ Em `admin.routes.ts:10`, `router.use(authenticate, requireAdmin)` garante a ordem. ✅

**Autorização ao nível de objecto (não apenas de rota):**
| Recurso | Verificação | Onde |
|---|---|---|
| Bet alheio (GET) | `bet.userId !== userId` → lookup `user.role === 'ADMIN'` | `bet.service.ts:122-125` ⚠️ query extra |
| Cancelar bet | `bet.userId !== userId` → throw | `bet.service.ts:133` ✅ |
| Grupo (GET) | `groupMember.findUnique(groupId_userId)` | `group.service.ts:90-93` ✅ |
| Eliminar grupo | `group.adminId !== userId` | `group.service.ts:122` ✅ |
| Ranking de grupo | membership check | `ranking.service.ts:27-30` ✅ |
| Notificação | `notification.userId !== userId` | `notification.service.ts:28` ✅ |

✅ A autorização ao nível de objecto está **sistemática e bem feita**. É o aspecto mais sólido do backend.

**Acesso a `api/health`** é público e devolve `status: 'ok'` — não faz check à base de dados. Um health check que não verifica a dependência crítica é quase inútil para orquestração.

### 4.4 Documentação OpenAPI

`config/swagger.ts` gera o spec via `swagger-jsdoc` com `apis: ['./src/routes/*.ts']` (`:84`).

⚠️ **As rotas NÃO têm JSDoc `@openapi` blocks.** O ficheiro `swagger.ts` define schemas (`User`, `Match`, `Bet`, `BetSelection`, `PaginatedBets`, `Error`) e o `definition`, mas o scan dos ficheiros de routes não encontra nada para extrair. **O `/api/docs` renderiza um UI vazio ou apenas a secção de schemas.** Isto explica porquê que o ficheiro tem 85 linhas de schemas detalhados mas a API não está documentada.

⚠️ **`import { version } from '../../package.json'`** (`:2`) — resolve para `apps/api/package.json` version `1.0.0`. Funciona com `resolveJsonModule: true` (`tsconfig.base.json:10`).

---

## 5. FRONTEND E GESTÃO DE ESTADO

### 5.1 Bootstrap e rotas

`main.tsx` monta `<BrowserRouter><AuthProvider><App/></AuthProvider></BrowserRouter>`.
`App.tsx` define 2 guards e 13 rotas.

| Guard | Implementação | Comportamento |
|---|---|---|
| `ProtectedRoute` | `App.tsx:19-24` | `loading` → `null` (blank); sem user → `<Navigate to="/login">` |
| `AdminRoute` | `App.tsx:26-32` | + `user.role !== 'ADMIN'` → `<Navigate to="/">` |

⚠️ **Ambos os guards retornam `null` durante `loading`** — ecrã branco puro. Numa rede lenta ou com o backend frio (Render free tier), o utilizador vê uma página em branco sem indicador. `Dashboard` tem um `DashboardSkeleton` bonito (`Dashboard.tsx:29-52`), mas **nunca é alcançado** porque o `ProtectedRoute` não renderiza nada até `loading` ser false.

| Rota | Componente | Guard |
|---|---|---|
| `/login` | `Login` | — |
| `/register` | `Register` | — |
| `/` | `Dashboard` | Protected |
| `/matches` | `Matches` | Protected |
| `/matches/:id` | `MatchDetail` | Protected |
| `/bets` | `Bets` | Protected |
| `/groups` | `Groups` | Protected |
| `/groups/:id` | `GroupDetail` | Protected |
| `/rankings` | `Rankings` | Protected |
| `/statistics` | `Statistics` | Protected |
| `/notifications` | `Notifications` | Protected |
| `/change-password` | `ChangePassword` | Protected |
| `/install` | `Install` | Protected |
| `/admin` | `Admin` | **Admin** |

⚠️ **Não existe rota `*` (404).** Um URL inválido renderiza o `Layout` com `<Outlet/>` vazio. UX de erro silencioso.

### 5.2 Camada de API — `lib/api.ts`

```typescript
const api = axios.create({ baseURL: '/api', headers: {...} });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(r => r, (error) => {
  if (error.response?.status === 401) localStorage.removeItem('token');
  return Promise.reject(error);
});
```

✅ **Padrão correcto e simples.** Todo o acesso HTTP passa por aqui.

⚠️ **No 401, remove o token mas não actualiza o estado do `AuthContext`.** O `useAuth().user` mantém-se preenchido em memória. O `AuthProvider` não reage à remoção. O utilizador fica num estado inconsistente: sem token, mas a UI ainda mostra "autenticado", até ao próximo `refreshUser()` ou reload. ⚠️ Não há redirect para `/login` no interceptor — a protecção depende de o componente re-renderizar e falhar a próxima chamada.

⚠️ **Nenhum timeout global.** Dois sítios usam `{ timeout: 5000 }` ad-hoc (`auth.tsx:50, 79`). O resto pode pendurar indefinidamente.

### 5.3 Estado de autenticação — `lib/auth.tsx`

Contexto React com `{ user, loading, login, register, logout, refreshUser }`.

**Persistência:** `localStorage['token']`, só o token JWT. O objecto `user` **não** é persistido — é re-fetched de `/users/me` no mount (`:41-56`). ✅ Decisão correcta: evita staleness e não duplica dados sensíveis.

**Wrappers `safe*`** (`:27-35`) try/catch em cada acesso ao localStorage — defensivo contra modo privado do Safari e `SecurityError` em iframes. ✅

**O problema do balance stale:** `refreshUser()` existe precisamente para actualizar o saldo após uma aposta. Está correctamente chamada em `BetSlip.tsx:28` e `Bets.tsx:54`. ✅ Mas:
- ⚠️ **As liquidações automáticas nunca chegam ao browser.** O `Navbar` faz poll de `unread-count` a cada 30s (`Navbar.tsx:23`) mas **não** de `/users/me`. Quando o cron liquida apostas, o `balance` no Header/Navbar/Sidebar fica desactualizado até o utilizador fazer uma acção (aposta, cancelar) ou recarregar.
- O `Navbar` mostra `user.balance` (`Navbar.tsx:52`) e o `Sidebar` também (`Sidebar.tsx:74`) — **ambos ficam stale indefinidamente**.

### 5.4 Zustand — `store/betSlip.ts` (55 linhas)

Store único, sem `persist` middleware (⚠️ a selections do bilhete **perdem-se ao recarregar a página**).

| Acção | Semântica |
|---|---|
| `addSelection(s)` | **substitui** se já existe `matchId+market`; senão adiciona |
| `removeSelection(matchId, market)` | remove por `matchId+market` |
| `setStake(n)` | define stake |
| `clear()` | `selections: []`, `stake: 10` (reset ao default) |
| `totalOdds()` | **produto** das odds |
| `selectTotalOdds` | selector equivalente para memoização |

✅ **A chave de identidade `matchId+market` espelha exactamente a regra de deduplicação do servidor** (`bet.service.ts:41`). Alinhamento frontend/backend correcto e consistente.

⚠️ **`totalOdds()` é um método que lê `get()`** — não é um selector reativo. Quando `BetSlip.tsx:117` chama `totalOdds().toFixed(2)`, o componente **re-renderiza porque `selections` ou `stake` mudaram** (desestruturados do store), portanto funciona por acidente. Mas o comment em `betSlip.ts:62` ("use this in components instead of calling totalOdds()") documenta o problema sem o resolver — `selectTotalOdds` **não é usado em lado nenhum** (verificado por grep). Código morto.

⚠️ **Sem validação de stake no store.** `setStake(-5)` ou `setStake(NaN)` é aceite. O `BetSlip` desabilita o botão se `stake <= 0` (`:128`) mas `NaN <= 0` é `false` ⇒ **o botão fica activo com `NaN`**, e `handlePlaceBet` (`:14`) também não bloqueia `NaN`. O Zod server-side rejeita com 400. Um input vazio (`Number('')` = `0` → bloqueado ✅) mas texto não-numérico dá `NaN`.

### 5.5 `BetSlip.tsx` — o componente crítico

`handlePlaceBet` (`:13-36`):
```typescript
if (selections.length === 0 || stake <= 0) return;
await api.post('/bets', {
  stake,
  selections: selections.map(s => ({ matchId, market, selection, odds: s.odds })),  // odds SENT but IGNORED
});
clear(); refreshUser(); setSuccess(true);
```

⚠️ **O campo `odds` é enviado e é inútil.** O servidor ignora-o (`bet.service.ts:26-36` re-lookup na BD). Enviar é inofensivo, mas é um vestígio de uma versão anterior e pode induzir um leitor a crer que o preço é negociável. `AGENTS.md:76` documenta correctamente que é ignorado.

⚠️ **O `error` não é limpo ao fechar.** `setError('')` só no início de `handlePlaceBet`. Uma aposta falhada deixa a mensagem até à próxima tentativa.

✅ `refreshUser()` é chamado **após** `clear()` — a ordem está certa (o `clear` despacha o re-render, o `refreshUser` actualiza o saldo).

### 5.6 Internacionalização — ⚠️ NÃO EXISTE

O prompt pergunta "how UI strings/internationalization are currently implemented". A resposta honesta: **não há sistema de i18n**.

O que existe:
1. **Strings hardcoded em PT-PT directamente no JSX** — ~150+ strings em 14 ficheiros de páginas. Ex.: `Dashboard.tsx:78` `"Olá, {name} 👋"`, `Bets.tsx:87` `"Pendentes"`, `Admin.tsx:122` `"Estatísticas"`.
2. **Datas/dinheiro** via `Intl` nativo: `toLocaleDateString('pt-PT')` (`Dashboard.tsx:232`, `Bets.tsx:158`), `toLocaleTimeString('pt-PT', {...})` (`Matches.tsx:165`, `MatchDetail.tsx:144`), `toLocaleString('pt-PT')` (`Notifications.tsx:71`).
3. **Um dicionário de labels de mercado** — `MatchDetail.tsx:7-31`, `MARKET_LABELS: Record<string, string>`, 22 entradas PT. **Duplicado** de forma parcial em `BetSlip.tsx:73` como chain de `.replace()`:
   ```typescript
   s.market.replace(/_/g, ' ').replace('MARCAS', 'GOLOS').replace('IMPAR PAR', 'ÍMPAR/PAR')
   ```
   Dois mecanismos diferentes para o mesmo conceito. O `BetSlip` não tem acesso ao `MARKET_LABELS` e reimplementa mal — `"MARCAS_2_5"` → `"GOLOS 2 5"` (o `.` desapareceu com o `_`), vs `MatchDetail` → `"Golos O/U 2.5"`. **Inconsistência visível ao utilizador entre o detalhe do jogo e o bilhete.**
4. **Mensagens de erro do servidor** — hardcoded em PT dentro dos services e routes, com dois idiomas misturados: `bet.service.ts:20` é PT ("não está disponível para apostas"), `bet.service.ts:29` é EN ("Odds not found for..."), `bet.service.ts:42` é EN ("Duplicate selection"). **O utilizador vê mensagens em inglês no ecrã de confirmação de aposta.**
5. **`"1"`/`"X"`/`"2"` são resolvidos por ternário** em `BetSlip.tsx:77`, `Matches.tsx:181`, `Bets.tsx:70-74`, `MatchDetail.tsx:196-200` — **a mesma lógica duplicada 4 vezes**, cada uma com `.slice(8)` vs `.slice(10)` vs nome completo. Inconsistente.

**Conclusão:** a app é monolingue PT-PT por convenção, sem extracção de strings. Qualquer segundo idioma exigiria um refactor transversal.

### 5.7 PWA (`public/`, `useIOS.ts`)

- `manifest.json` (60 linhas), `sw.js` (116 linhas), ícones 192/512 (png + svg).
- `useIOS` (`:3-34`) detecta: `isIOS` (incl. iPadOS 13+ via `Macintosh` + `maxTouchPoints`), `isSafari` (exclui Chrome), `isStandalone` (`display-mode: standalone`), `hasNotch` (heurística `screen.height >= 812`), `iosVersion` (parse de `OS (\d+)_`).
- `useKeyboard` (`:36-63`) — track foco em inputs via `focusin`/`focusout` com 100ms de debounce.
- `Layout.tsx` usa `env(safe-area-inset-top/bottom)` e `env(safe-area-inset-left/right)`, breakpoint 1024px, `requestAnimationFrame`-throttled no resize (`:14-25`).
- `InstallBanner` (160 linhas) + página `Install` (160 linhas).

⚠️ **O `service worker` não é registado em lado nenhum.** Grep por `registerServiceWorker`/`navigator.serviceWorker` no `main.tsx` / `App.tsx` — ausente. O `public/sw.js` é servido mas **nunca é activado**, portanto não há offline support nem cache. A "instalação" via `manifest.json` funciona (o browser instala sem SW), mas a app não é realmente offline-capable.

### 5.8 Testes frontend

`tests/hooks.test.ts` (25 linhas) — verifica apenas `typeof mod.useIOS === 'function'`. `tests/localStorage.test.ts` (28 linhas) — testa **o mock**, não a app. `tests/setup.ts` tem 1 linha. **Cobertura effectively zero.**

---

## 6. JOBS E CAPACIDADES DE ADMIN

### 6.1 ⚠️ `apps/api/src/jobs/` NÃO EXISTE

O prompt pede `settleBets.job.ts`. Inexistente. O que existe em vez disso:

**Dois endpoints HTTP em `index.ts:59-92`**, montados **antes** dos routers de API e **fora** de qualquer router:

```typescript
let syncRunning = false;      // :59
let settleRunning = false;    // :60

app.get('/api/cron/sync', async (req, res) => {
  if (req.headers.authorization !== `Bearer ${env.CRON_SECRET}`) return res.status(401)...
  if (syncRunning) return res.status(409).json({ error: 'Already running' });
  syncRunning = true;
  try   { const count = await matchService.syncMatches(); res.json({ ok: true, synced: count }); }
  catch { res.status(500).json({ error: 'Sync failed' }); }
  finally { syncRunning = false; }
});

app.get('/api/cron/settle', async (req, res) => {
  if (req.headers.authorization !== `Bearer ${env.CRON_SECRET}`) return res.status(401)...
  if (settleRunning) return res.status(409).json({ error: 'Already running' });
  settleRunning = true;
  try   { await betService.settlePendingBets(); res.json({ ok: true }); }
  catch { res.status(500).json({ error: 'Settlement failed' }); }
  finally { settleRunning = false; }
});
```

### 6.2 A "crontologia" — onde está

⚠️ **Não existe nenhuma configuração de cron no repositório.** Nenhum `crontab`, nenhum `vercel.json` `crons` (o `vercel.json` actual não tem o array `crons` — que exigiria um plano Pro), nenhum GitHub Actions, nenhum `node-cron.schedule`.

**`node-cron@3.0.3` e `@types/node-cron` estão instalados eDeclared** (`package.json:25, 36`) mas **nunca são importados** — confirmado por grep em todo o repositório. É uma dependência morta.

**A crontologia é 100% externa e não versionada.** O operador tem de configurar, por conta própria, fora do repositório:
- **Vercel Cron** (requer plano Pro) — `GET /api/cron/sync` a cada 30min, `GET /api/cron/settle` a cada 2min
- **cron do Render** (o `Dockerfile` tem o comentário *"Render.com runs the build command, then the start command"*) — um `render.yaml` ou cron externo a chamar os mesmos URLs
- **cron do sistema / QingCloud / EasyCron** — qualquer提供edor externo

**Consequências:**
1. **Nenhuma garantia de execução.** Se ninguém configurar o cron externo, as apostas **nunca liquidam**. Não há fallback interno, não há job no arranque. Um operador novo que deploye e não configure o cron tem um sistema onde as apostas ficam `PENDING` para sempre e os saldos nunca actualizam. **Não há documentação disto** — `DEPLOY.md` seria o local natural.
2. **`AGENTS.md:46` documenta `src/jobs/` com "every 30 min" e "every 2 min + on startup".** Nenhum dos três existe. A documentação é **factualmente errada** e vai enganar o próximo developer.
3. **O `POSTS_PRONTOS.md:74` está correcto:** *"HTTP cron endpoints instead of node-cron (works on Vercel)"*. A decisão de arquitectura foi correcta; a documentação em `AGENTS.md` é que divergiu.

### 6.3 Guards de concorrência — ✅ e ❌

O `syncRunning`/`settleRunning` é um **boolean in-memory** que funciona **dentro de um único processo**:
- ✅ Previne invocações concorrentes **no mesmo container**.
- ❌ **Não previne múltiplas instâncias.** Na Vercel, cada invocação pode correr num container diferente — os guards não são coordenados. Duas invocações simultâneas (ex.: cron a disparar enquanto um admin clica "sync") executam em paralelo em lambdas distintas.
- ❌ **Não previne o overlap entre sync e settle.** São flags separadas. Um settle a correr enquanto um sync actualiza `match.status` para `FINISHED` vê um estado intermédio.
- ⚠️ **A secção-crítica é macia:** o `finally` faz reset mas uma excepção *síncrona* antes do `try` (impossível aqui) ou um `process.exit` deixaria a flag travada.

### 6.4 Comparação: dois caminhos para sync e settle

| Operação | Via cron | Via admin | Mesma função? |
|---|---|---|---|
| Sync de jogos | `GET /api/cron/sync` → `matchService.syncMatches()` | `POST /api/matches/sync` → `matchService.syncMatches()` | ✅ mesma |
| Sync de odds | — | `POST /api/matches/sync-odds` → `applyScrapedOdds()` | ❌ **só admin** |
| Settlement | `GET /api/cron/settle` → `settlePendingBets()` | `POST /api/bets/settle` → `settlePendingBets()` | ✅ mesma |

⚠️ **`POST /api/bets/settle` (admin) não tem o guard `settleRunning`.** Um admin que clique duas vezes (ou dois admins em simultâneo) lança duas liquidações concorrentes. Como ambas fazem `findMany({ where: { status: 'PENDING' }})` antes de qualquer update, **ambas leem as mesmas apostas e ambas_as pagam**. ⚠️ **Este é um bug de double-payout directamente explorável por qualquer ADMIN** (e por qualquer utilizador comprometido via o escalonamento de §4.3). A transaction não protege porque o `where: { status: 'PENDING' }` está no `findMany`, não no `bet.update`.

**Correção mínima:** o `bet.update` de settlement deveria ser `tx.bet.updateMany({ where: { id, status: 'PENDING' }, data: {...} })` e verificar `count === 1` antes de creditar.

### 6.5 Capacidades Admin — inventário completo

**8 endpoints, todos ⛔ (JWT + `requireAdmin` via `router.use`, `admin.routes.ts:10`).**

| Capacidade | Endpoint | Implementação | Notas |
|---|---|---|---|
| **Ver estatísticas globais** | `GET /admin/stats` | `admin.service.ts:91-101` | 6 contagens em `Promise.all`: totalUsers, totalBets, totalGroups, pendingBets, totalWon, totalLost |
| **Listar utilizadores** | `GET /admin/users?page=N` | `:5-35` | Paginação offset, `totalPages: Math.ceil(total/limit)`. ⚠️ `page` não é validado por Zod — `parseInt('abc') \|\| 1` → 1 ✅, `page=-1` → `skip` negativo ⇒ erro Prisma |
| **Criar utilizador** | `POST /admin/users` | `:37-47` | `bcrypt.hash(12)`, `balance` default 100, validação Zod inline (`:12-17`) com `.optional().default(100)`. ⚠️ Não atribui role — **não é possível criar admin via API** |
| **Definir saldo** | `PATCH /admin/users/:id` | `:49-67` | Bounds: `0 ≤ balance ≤ 1_000_000`. `profit`/`betsCount` **não** são editáveis |
| **Bloquear/desbloquear** | `PATCH /admin/users/:id` | `:57-59` | ⚠️ **Não permite bloquear ADMIN** — `if (user.role === 'ADMIN' && data.isBlocked) throw` |
| **Promover/rebaixar role** | `PATCH /admin/users/:id` | `:63` | Zod enum `['USER','ADMIN']`. ⚠️ **Sem auto-protecção**: um admin pode despromover-se a si próprio e lockar-se fora. E **sem invalidação de tokens** (§4.3) |
| **Eliminar utilizador** | `DELETE /admin/users/:id` | `:69-75` | ⚠️ **Não verifica propriedade de grupos** ⇒ falha com P2003 se o user for group-admin (§2.4). A mensagem de erro crua do Prisma é devolvida ao cliente |
| **Listar grupos** | `GET /admin/groups` | `:77-85` | Inclui `admin {id,name}` + `_count.members`. **Sem paginação** |
| **Eliminar grupo** | `DELETE /admin/groups/:id` | `:87-89` | `prisma.group.delete` ⇒ Cascade limpa `GroupMember` ✅ |
| **Sincronizar jogos** | `POST /matches/sync` | `match.service.ts:78` | football-data.org + fallback |
| **Aplicar odds scrapadas** | `POST /matches/sync-odds` | `match.service.ts:255` | Lê `odds.json` |
| **Forçar liquidação** | `POST /bets/settle` | `bet.service.ts:150` | ⚠️ sem guard (§6.4) |

**O que o admin NÃO pode fazer:**
- Editar o resultado de um jogo (`homeScore`/`awayScore`) — **não há endpoint**. A única forma de um match ficar `FINISHED` é via `syncMatches` a partir da API externa. Em fallback (jogos fictícios), **os jogos nunca ficam `FINISHED`** ⇒ apostas nunca liquidam ⇒ o sistema fica inoperacional no modo de fallback. Este é um buraco funcional grande que nenhum documento menciona.
- Editar `profit`, `betsCount`, `betsWon`, `roi`
- Criar/editar mercados ou odds manualmente
- Ver apostas de todos os utilizadores (só `GET /bets/:id` por id)
- Fazer reset de password de utilizador
- Ver auditoria/logs

**UI Admin (`pages/Admin.tsx`, 237 linhas):** 4 tabs — Estatísticas / Utilizadores / Grupos / Sincronizar.
⚠️ Usa `alert()` e `prompt()` para feedback e input (`Admin.tsx:75, 85, 90, 100, 105`) — **anti-pattern grave de UX** que bloqueia a thread e não é estilizável. O `prompt('Novo saldo:')` + `parseFloat` sem validação: `parseFloat('abc')` = `NaN` → enviado ao servidor → Zod `.number()` rejeita → 400 → `alert(err.message)` que é `"Erro ao definir saldo"` (o `catch` em `:83-86` faz `error instanceof Error` sobre o **axios error**, não sobre a resposta — a mensagem real do servidor é descartada).
⚠️ O `handleCreateUser` faz `setUsers(prev => [r.data, ...prev])` mas o objecto retornado por `POST /admin/users` tem `{id, name, email, balance, role}` — **sem** `betsCount`, `betsWon`, `roi`, `profit`, `isBlocked`, `createdAt` que a interface `AdminUser` declara. O novo utilizador aparece com `undefined` nesses campos até um refresh.

---

## 7. SÍNTESE

### 7.1 Classificação

| Dimensão | Estado |
|---|---|
| Estrutura e layering | ✅ Limpo e consistente (routes → services → prisma) |
| Autorização ao nível de objecto | ✅ Sistemática e correcta em 6/6 recursos |
| Atomicidade da dedução de saldo | ✅ `where: { balance: { gte: stake } }` — o padrão certo |
| Trava de odds contra manipulação | ✅ Odds sempre re-lidas da BD |
| Deduplicação front/back | ✅ Chave `matchId+market` consistente |
| Persistência de sessão | ⚠️ Token em localStorage, sem revogação |
| Modelo de dados | ✅ 8 modelos bem desenhados, índices correctos |
| Gestão de erros | ✅ Padrão consistente try/catch com mensagens PT |
| **Estatísticas de utilizadores** | ❌ **Functionalmente quebradas** (§3.6) |
| **Mercado Resultado Intervalo** | ❌ **Apostas garantidas para perder** (§3.3) |
| **Escala da liquidação** | ❌ **Transacção única O(n) com timeout 5s** (§3.4) |
| **Notificações dentro da transacção** | ❌ **Usam `prisma` global, não `tx`** (§3.3) |
| **Double-payout via settle manual** | ❌ **Admin pode liquidar duas vezes** (§6.4) |
| **Escalonamento de privilégios** | ❌ **Role no JWT sem revalidação** (§4.3) |
| **Documentação (AGENTS.md)** | ❌ **Factualmente errada em §0 e §6.2** |
| Testes | ⚠️ Existe framework; os testes do bet não testam o código real |
| i18n | ❌ Inexistente (monolingue hardcoded) |

### 7.2 Os 6 problemas que eu corrigiria primeiro

1. **`betsCount`/`betsWon`/`roi` nunca actualizados** (§3.6) — metade dos ecrãs do produto mostra zeros para sempre. Fix: reescrever `updateStats` contra `tx` e chamar dentro do `settlePendingBets`.
2. **`settlePendingBets` numa transacção única sem `timeout` nem batching** (§3.4) — o job falha em escala. Fix: processar em lotes de N, `timeout: 60000`, e mover o `findMany` para fora da transacção.
3. **Double-payout em `POST /bets/settle`** (§6.4) — guard `count===1` num `updateMany` condicional.
4. **Role no JWT sem revalidação** (§4.3) — `requireAdmin` deve fazer lookup do user na BD (ou aceitar tokens de 15min + refresh).
5. **Notificações fora da transacção** (§3.3, §3.2) — passar `tx` ao `notificationService`.
6. **`RESULTADO_INTERVALO`** (§3.3) — ou popular `halfTimeHome/Away` no sync, ou remover o mercado de `generateOdds` e do `MARKET_LABELS`.

### 7.3-itens de configuração a resolver antes de produção

| Item | Risco |
|---|---|
| `CRON_SECRET` não validada no arranque (`env.ts:10`, `index.ts:62-92`) | Auth bypass com header `Bearer ` |
| Nenhum cron configurado no repo (§6.2) | Apostas nunca liquidam |
| `seed.ts` corre em cada arranque do Docker (`Dockerfile:57`) | Credenciais `admin123` garantidas |
| `JWT_SECRET` default `your-secret-key` em `docker-compose.yml:28` | Tokens forjáveis |
| `apps/api/.env` presente no disco (não no git ✅) | ⚠️ Confirmado gitignored; verificar que nunca foi commitado |
| `process.chdir()` em `api/index.js:4` | Provavelmente inoperante na Vercel |
| CSP desligada (`index.ts:37`) | Defesa por camada removida |
| `deleteUser` não trata grupos拥有的 | Erro P2003 ao admin |
| Vite em 5555 vs CORS em 5173 | CORS quebrado se o proxy não for usado |

---

*Fim do relatório. Cobertura: 60/60 ficheiros de código e configuração lidos integralmente. Excluídos apenas artefactos de build e `package-lock.json`.*
