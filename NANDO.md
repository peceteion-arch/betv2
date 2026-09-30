# betNANDO — Estado Atual do Código

Documento de referência do que a aplicação **realmente faz hoje**. Descreve o
código existente, não intenções. Onde o comportamento diverge do que a
documentação anterior prometia, está assinalado em **Divergências**.

Última revisão: após o patch de correção dos 6 bugs críticos (6 bugs) e a
consolidação do lock de liquidação.

---

## 1. Visão Geral

Monopólio de apostas entre amigos com créditos virtuais. Sem dinheiro real, sem
pagamentos, sem depósitos, sem levantamentos.

Monorepo npm workspaces:

```
betNANDO/
├── apps/
│   ├── api/          Express + Prisma + PostgreSQL
│   └── web/          React + Vite + Tailwind
├── NANDO.md
├── docker-compose.yml
├── vercel.json
└── turbo.json
```

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS 3, React Router 6, Zustand, Axios |
| Backend | Node.js, Express 4, TypeScript (`strict: true`) |
| Base de dados | PostgreSQL 16, Prisma 5 |
| Autenticação | JWT (`jsonwebtoken`) + bcrypt (12 rounds) |
| Validação | Zod |
| Testes | Vitest (API e Web) |
| Docs API | Swagger UI em `/api/docs` |
| Deploy | `vercel.json` (serverless) + `docker-compose.yml` |

---

## 3. Modelo de Dados

Fonte: `apps/api/prisma/schema.prisma`. Valores monetários são `Decimal(10,2)`;
código converte para `number` na fronteira da API.

- **User** — `id`, `name`, `email` (único), `passwordHash`, `balance` (default
  **100**), `betsCount`, `betsWon`, `roi`, `profit`, `role` (`USER`|`ADMIN`),
  `isBlocked`, timestamps.
- **Group** — `name`, `inviteCode` (único, 8 chars hex), `adminId`, membros.
- **GroupMember** — relação N:N User↔Group, `@@unique([groupId, userId])`.
- **Match** — `externalId` (único), equipas, emblemas, competição, `matchDate`,
  `status`, `homeScore`, `awayScore`, `halfTimeHome`, `halfTimeAway`.
- **Odds** — `matchId` + `market` + `selection` + `value`.
  `source`: `estimated` | `oddspedia`. Unique em `[matchId, market, selection]`.
- **Bet** — `userId`, `stake`, `totalOdds`, `potentialReturn`, `status`
  (`PENDING`|`WON`|`LOST`|`CANCELLED`), `settledAt`.
- **BetSelection** — `betId`, `matchId`, `market`, `selection`, `odds`, `won`
  (`Boolean?` — `null` = void).
- **Notification** — `userId`, `type`, `message`, `read`.

---

## 4. Rotas da API

Todas sob `/api`. Swagger em `/api/docs`, health check em `/api/health`.

### 4.1 Auth — `/api/auth`
| Método | Rota | Auth | Notas |
|---|---|---|---|
| POST | `/register` | — | Zod; bcrypt 12; devolve JWT |
| POST | `/login` | — | Bloqueados rejeitados |

### 4.2 Users — `/api/users`
`GET /me`, `PATCH /me`, `POST /change-password` — todos autenticados.

### 4.3 Groups — `/api/groups`
`POST /` (criar, admin entra automático), `POST /join`, `GET /`,
`GET /:id`, `DELETE /:id` (só o admin do grupo). Limite de **50 membros**.

### 4.4 Matches — `/api/matches`
`GET /` (próximos), `GET /live`, `GET /:id`.
`POST /sync` e `POST /sync-odds` — **admin**.

### 4.5 Bets — `/api/bets`
`POST /` (colocar aposta), `GET /`, `GET /active`, `GET /:id`,
`POST /:id/cancel`, `POST /settle` (**admin**, com lock — ver §6).

### 4.6 Rankings — `/api/rankings`
`GET /global`, `GET /group/:id` (exige membro do grupo).
Ordenado por `balance` descendente. Expõe `balance`, `profit`, `roi`,
`betsCount`, `betsWon`.

### 4.7 Notifications — `/api/notifications`
`GET /`, `GET /unread-count`, `PATCH /:id/read`, `POST /read-all`.

### 4.8 Admin — `/api/admin` (todos `authenticate` + `requireAdmin`)
`GET /stats`, `GET /users`, `POST /users`, `PATCH /users/:id`,
`DELETE /users/:id`, `GET /groups`, `DELETE /groups/:id`.
Proteções: não permite bloquear nem eliminar utilizadores `ADMIN`.

### 4.9 Cron — protegido por `CRON_SECRET`
| Método | Rota | Notas |
|---|---|---|
| GET | `/api/cron/sync` | Sincroniza jogos; lock `syncRunning` |
| GET | `/api/cron/settle` | Liquida apostas; lock partilhado — ver §6 |

---

## 5. Mercados de Aposta

Odds estimadas geradas por `matchService.generateOdds` (jitter ±3%). Mercados:

`1X2`, `DUPLA_HIPOTESE`, `MARCAS_0_5`…`MARCAS_4_5`, `AMBAS_MARCAM`,
`RESULTADO_CORRETO`, `IMPAR_PAR`.

Odds reais de fonte externa aplicáveis via `POST /api/matches/sync-odds`
(`odds.json`, `source: 'oddspedia'`).

**`RESULTADO_INTERVALO` foi removido** (ver §10, Bug 6). Nenhum feed popula
`halfTimeHome`/`halfTimeAway`, pelo que a aposta seria sempre perdida. Em
`checkSelectionWon` devolve agora `null` (void) — aposta existente é anulada com
devolução do stake, em vez de perdida. A UI não tem label nem branch de
renderização para este mercado.

Mercados com `checkSelectionWon` mas sem odds estimadas (existem apenas se
importados de fonte externa): `HANDICAP_*`, `GOLOS_0`…`GOLOS_6`.
`HANDICAP_0_0` devolve `null` por desenho (push).

---

## 6. Liquidação

`betService.settlePendingBets()` — tranzacção única sobre todas as apostas
`PENDING`.

Por aposta: cada seleção é avaliada. `POSTPONED`/`CANCELLED` do jogo, ou
`checkSelectionWon` a devolver `null` → void. Se alguma seleção perde → aposta
`LOST` (bet-perdida, sem pagamento). Se todas as escolhas estão `null` e o jogo
está `FINISHED` → `CANCELLED` com devolução do stake. Senão → `WON`, com
`balance += potentialReturn`.

**Guardas de duplicação (duas camadas):**

1. `src/lib/settlement-lock.ts` — flag `settleRunning` partilhada entre
   `index.ts` (cron) e `bet.routes.ts` (`POST /bets/settle`). O segundo
   gatilho obtém **409**. O lock é apenas em memória, por processo.
2. `tx.bet.updateMany({ where: { id, status: 'PENDING' } })` — a verdadeira rede de
   segurança: sob Read Committed, o segundo settlement re-avalia o `WHERE` após
   o lock de linha e recebe `count === 0`, saltando o pagamento. Esta guarda é
   correcta mesmo entre processos, e é a que protege o dinheiro.

`userService.updateStats` (Bugs 1–2) actualiza `betsCount`/`betsWon`/`profit`/
`roi` em WON e LOST, dentro da mesma transacção, via `tx`. Paraancelladas não
são contadas. `notificationService.create` recebe `tx`, portanto notificações
são revertidas com a transacção.

**Nota ROI:** porque a aposta já está `WON`/`LOST` quando `updateStats`
agrega, a soma de stakes já inclui a aposta corrente; `updateStats` só soma
`stake` quando chamado **fora** de uma transacção (`!tx`), evitando duplicação.

---

## 7. Autenticação e Autorização

- `authenticate` — verifica JWT, extrai `userId` e `role` para `req`.
- `requireAdmin` — **revalida em BD**: `prisma.user.findUnique` por
  `role`+`isBlocked`. Não confia no claim `role` do JWT (este pode ter até 7
  dias). Bloqueado/inexistente → 403; não-ADMIN → 403. `req.userRole` é
  reatribuído a partir da BD.
- `env.ts` — lança erro no arranque se faltar `JWT_SECRET`, `CRON_SECRET` ou
  `DATABASE_URL` (previne o bypass com `CRON_SECRET` vazio).
- Rotas cron — comparam o header `Authorization` depois de extrair o Bearer;
  header vazio é rejeitado (`!provided`).

---

## 8. Odds: Fonte de Dados

`matchService.fetchFromApi` chama `api.football-data.org` (competição `WC`).
Se não houver `FOOTBALL_DATA_API_KEY`, devolve jogos de fallback gerados
localmente. `syncMatches` filtra para World Cup. Odds estimadas são geradas
apenas quando o jogo ainda não tem nenhuma odd.

---

## 9. Seed

`prisma/seed.ts` — upsert idempotente. Cria admin
`admin@betnando.com`/`admin123`, 5 utilizadores de exemplo, e um grupo
`Amigos do Futebol` com `inviteCode` `TESTCODE`.

---

## 10. Divergências (documento anterior vs. código)

A documentação anterior (prompt original) não corresponde ao que existe. As
divergências notáveis, sem inventar functionality:

- **Mercado ao intervalo** — `RESULTADO_INTERVALO` foi removido das odds geradas
  e da UI; ver §5.
- **Liquidação automática a cada 5 min** — **não existe temporizador no
  servidor.** `node-cron` é dependência mas nunca importado. A liquidação só é
  acionada por HTTP: `GET /api/cron/settle` (externo, ex. cron de infra) ou
  `POST /api/bets/settle` (admin). Para automatizar é preciso configurar um
  cron externo a chamar o endpoint.
- **Mercados de cantos e cartões** — não implementados.
- **Elo/forma/classificação para odds estimadas** — não implementadas; a
  estimativa é um jitter sobre odds base fixas.
- **E-mail / push de notificações** — não existem; notificações são apenas
  registos em BD lidos por `GET /api/notifications`.
- **Handicap Asiático, Mercado de Cantos/Cartões** — não existem (ver §5 para o
  que há).
- **Múltiplas fontes de futebol (TheSportsDB, etc.)** — apenas
  `football-data.org`.
- **Sessões seguras / refresh tokens** — apenas JWT stateless com validade por
  `JWT_EXPIRES_IN` (7 dias por omissão).
- **Filtros de histórico (hoje/semana/mês)** — não implementados; `GET
  /api/bets` suporta apenas filtro por `status` e paginação por cursor.

---

## 11. Verificação

```
cd apps/api
npx tsc --noEmit        # deve sair 0
npm test                # 27 testes
```

`apps/api/vitest.config.ts` injecta `DATABASE_URL`, `JWT_SECRET` e
`CRON_SECRET` fictícios via `test.env` (porque `env.ts` lança no arranque sem
eles). Não são usados para assinar/verificar nada.

A app web tem `npm test` (Vitest + jsdom) e `npm run build` (tsc + vite build).
