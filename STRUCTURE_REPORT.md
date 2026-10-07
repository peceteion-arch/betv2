# STRUCTURE_REPORT
Generat: 2026-10-07 13:05  
Radacina: `E:\BetNando\betNANDO`

## 1. Arbore
```
betNANDO/
├── .claude/
│   └── settings.local.json
├── .git/  [exclus]
├── .turbo/  [exclus]
├── api/
│   └── index.js
├── apps/
│   ├── api/
│   │   ├── .turbo/  [exclus]
│   │   ├── dist/  [exclus]
│   │   ├── node_modules/  [exclus]
│   │   ├── prisma/
│   │   │   ├── migrations/
│   │   │   │   ├── 20261005145354_init/
│   │   │   │   ├── 20261005162906_match_team_competition/
│   │   │   │   ├── 20261005192733_match_optional_competition_and_league/
│   │   │   │   ├── 20261006075347_add_odds_management/
│   │   │   │   ├── 20261006204730_add_competition_active/
│   │   │   │   └── migration_lock.toml
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   ├── scripts/
│   │   │   ├── cleanup-test-data.ts
│   │   │   ├── count-data.ts
│   │   │   ├── import-minifotbal.ts
│   │   │   └── testDataCriteria.ts
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   ├── env.ts
│   │   │   │   └── swagger.ts
│   │   │   ├── lib/
│   │   │   │   ├── match.serializer.ts
│   │   │   │   ├── odds-events.ts
│   │   │   │   ├── prisma.ts
│   │   │   │   ├── settlement-lock.ts
│   │   │   │   ├── settlement.ts
│   │   │   │   └── upload.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   └── validation.ts
│   │   │   ├── routes/
│   │   │   │   ├── admin.routes.ts
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── bet.routes.ts
│   │   │   │   ├── competition.routes.ts
│   │   │   │   ├── group.routes.ts
│   │   │   │   ├── match.routes.ts
│   │   │   │   ├── notification.routes.ts
│   │   │   │   ├── odds.routes.ts
│   │   │   │   ├── ranking.routes.ts
│   │   │   │   ├── team.routes.ts
│   │   │   │   └── user.routes.ts
│   │   │   ├── services/
│   │   │   │   ├── admin.service.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── bet.service.ts
│   │   │   │   ├── competition.service.ts
│   │   │   │   ├── group.service.ts
│   │   │   │   ├── match.service.ts
│   │   │   │   ├── notification.service.ts
│   │   │   │   ├── ranking.service.ts
│   │   │   │   ├── team.service.ts
│   │   │   │   └── user.service.ts
│   │   │   └── index.ts
│   │   ├── tests/
│   │   │   ├── helpers/
│   │   │   │   ├── assertTestDatabase.test.ts
│   │   │   │   └── assertTestDatabase.ts
│   │   │   ├── bet.service.serialization.test.ts
│   │   │   ├── e2e-settlement.ts
│   │   │   ├── env.test.ts
│   │   │   ├── errors.test.ts
│   │   │   ├── schemas.test.ts
│   │   │   ├── settlement-logic.test.ts
│   │   │   └── testDataCriteria.test.ts
│   │   ├── uploads/
│   │   │   └── competition-logos/
│   │   │       ├── 0b315521-a351-484b-ad40-3b4b5c829f2e.jpg
│   │   │       ├── 4a318e7f-3322-4613-b64b-445e9cc248a1.jpg
│   │   │       ├── 5ee54b00-36b3-471b-9c3a-0d816fc7b5c2.jpg
│   │   │       ├── 7b139393-8d1d-4ac5-825c-9ed3c461e642.jpg
│   │   │       ├── bb0c9c42-814b-418c-863f-039223448e24.jpg
│   │   │       ├── e9951ad2-40a6-4904-901a-53d38f70aa75.jpg
│   │   │       └── f33a5f2a-e0f2-448f-9f75-570bedfd80a0.jpg
│   │   ├── .env
│   │   ├── .env.example
│   │   ├── Dockerfile
│   │   ├── package-lock.json
│   │   ├── package.json
│   │   ├── server.log
│   │   ├── server.pid
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   └── web/
│       ├── .turbo/  [exclus]
│       ├── dist/  [exclus]
│       ├── node_modules/  [exclus]
│       ├── public/
│       │   ├── icons/
│       │   │   ├── icon-192.png
│       │   │   ├── icon-192.svg
│       │   │   └── icon-512.png
│       │   ├── manifest.json
│       │   └── sw.js
│       ├── src/
│       │   ├── components/
│       │   │   ├── layout/
│       │   │   ├── BetSlip.tsx
│       │   │   ├── BetSlipInline.tsx
│       │   │   └── InstallBanner.tsx
│       │   ├── hooks/
│       │   │   ├── useIOS.ts
│       │   │   └── useOddsStream.ts
│       │   ├── lib/
│       │   │   ├── api.ts
│       │   │   └── auth.tsx
│       │   ├── pages/
│       │   │   ├── Admin.tsx
│       │   │   ├── AdminCompetitions.tsx
│       │   │   ├── Bets.tsx
│       │   │   ├── Bets.tsxxxxx
│       │   │   ├── ChangePassword.tsx
│       │   │   ├── Dashboard.tsx
│       │   │   ├── GroupDetail.tsx
│       │   │   ├── Groups.tsx
│       │   │   ├── Install.tsx
│       │   │   ├── Login.tsx
│       │   │   ├── MatchDetail.tsx
│       │   │   ├── Matches.tsx
│       │   │   ├── Notifications.tsx
│       │   │   ├── Rankings.tsx
│       │   │   ├── Register.tsx
│       │   │   └── Statistics.tsx
│       │   ├── store/
│       │   │   ├── betSlip.ts
│       │   │   └── liveOdds.ts
│       │   ├── App.tsx
│       │   ├── index.css
│       │   ├── main.tsx
│       │   └── vite-env.d.ts
│       ├── tests/
│       │   ├── hooks.test.ts
│       │   ├── localStorage.test.ts
│       │   └── setup.ts
│       ├── Dockerfile
│       ├── index.html
│       ├── package.json
│       ├── postcss.config.js
│       ├── tailwind.config.js
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── vitest.config.ts
├── node_modules/  [exclus]
├── .dockerignore
├── .eslintrc.json
├── .gitignore
├── .prettierignore
├── .prettierrc
├── AGENTS.md
├── backup-betleague.sql
├── DEPLOY.md
├── dev.bat
├── docker-compose.yml
├── Dockerfile
├── IMPLEMENTATION_SUMMARY.md
├── LICENSE
├── NANDO.md
├── package-lock.json
├── package.json
├── POSTS_PRONTOS.md
├── README.md
├── stop.bat
├── tsconfig.base.json
├── turbo.json
└── vercel.json
```

## 2. Foldere node_modules
- `apps/api/node_modules` - 276.6 MB
- `apps/web/node_modules` - 3.8 MB
- `node_modules` - 695.9 MB

Pentru un monorepo cu npm workspaces ar trebui, de regula, un singur `node_modules` la radacina (eventual unul mic in fiecare app pentru pachete cu versiuni diferite). Mai multe `node_modules` mari = instalari facute separat.

## 3. Duplicate si foldere imbricate
Nu am gasit fisiere duplicate (dupa ultimele 3 componente ale caii).

## 4. Fisiere de configurare
- **.dockerignore**
  - `.dockerignore`
- **.env***
  - `apps/api/.env`
  - `apps/api/.env.example`
- **.gitignore**
  - `.gitignore`
- **Dockerfile**
  - `Dockerfile`
  - `apps/api/Dockerfile`
  - `apps/web/Dockerfile`
- **docker-compose.yml**
  - `docker-compose.yml`
- **package-lock.json**
  - `package-lock.json`
  - `apps/api/package-lock.json`
- **package.json**
  - `package.json`
  - `apps/api/package.json`
  - `apps/web/package.json`
- **postcss.config.js**
  - `apps/web/postcss.config.js`
- **schema.prisma**
  - `apps/api/prisma/schema.prisma`
- **tailwind.config.js**
  - `apps/web/tailwind.config.js`
- **tsconfig.base.json**
  - `tsconfig.base.json`
- **tsconfig.json**
  - `apps/api/tsconfig.json`
  - `apps/web/tsconfig.json`
- **turbo.json**
  - `turbo.json`
- **vite.config.ts**
  - `apps/web/vite.config.ts`
- **vitest.config.ts**
  - `apps/api/vitest.config.ts`
  - `apps/web/vitest.config.ts`
- migrari prisma in `apps/api/prisma/migrations`: 5 foldere

_Fisierele .env sunt doar listate, continutul nu este citit._

ATENTIE: mai multe lockfile-uri (de regula ar trebui unul, la radacina):
- `package-lock.json`
- `apps/api/package-lock.json`

### package.json (name / workspaces / scripts)
**`package.json`**
```
name: betnando
workspaces: ['apps/*', 'packages/*']
scripts:
  dev: turbo dev
  build: turbo build
  lint: turbo lint
  lint:fix: eslint . --ext .ts,.tsx --fix
  format: prettier --write "apps/**/*.{ts,tsx,json,css}"
  format:check: prettier --check "apps/**/*.{ts,tsx,json,css}"
  db:generate: cd apps/api && npx prisma generate
  db:push: cd apps/api && npx prisma db push
  db:seed: cd apps/api && npx tsx prisma/seed.ts
  db:studio: cd apps/api && npx prisma studio
  test: turbo test
  test:api: cd apps/api && npx vitest run
  test:web: cd apps/web && npx vitest run
```
**`apps/api/package.json`**
```
name: api
scripts:
  dev: tsx watch src/index.ts
  build: tsc
  start: node dist/index.js
  lint: eslint src --ext .ts
  test: vitest run
  test:watch: vitest
  cleanup:test-data: tsx scripts/cleanup-test-data.ts
  import:minifotbal: tsx scripts/import-minifotbal.ts
  test:e2e: tsx tests/e2e-settlement.ts
```
**`apps/web/package.json`**
```
name: web
scripts:
  dev: vite
  build: tsc && vite build
  preview: vite preview
  lint: eslint . --ext ts,tsx
  test: vitest run
  test:watch: vitest
```

## 5. Fisiere ratacite
- `apps/api/server.log` - 1.5 KB
- `apps/api/server.pid` - 5 B
- folder `apps/api/dist/` - 264.8 KB
- folder `apps/web/dist/` - 374.4 KB
- folder `apps/api/uploads/` - 313.1 KB

## 6. Git
```
git status --short (8 linii, primele 100):
   D "apps-ultima care a mers.zip"
   M apps/api/src/routes/odds.routes.ts
   M apps/api/tests/bet.service.serialization.test.ts
   D apps/apps/api/tests/bet.service.serialization.test.ts
   M apps/web/src/pages/MatchDetail.tsx
   D "cote actualizate corect cu zecimale.zip"
   D "cote actualizate.zip"
  ?? apps/api/uploads/competition-logos/bb0c9c42-814b-418c-863f-039223448e24.jpg

.gitignore:
  node_modules/
  dist/
  .env
  .env.local
  *.log
  .DS_Store
  coverage/
  .nyc_output/
  *.db
  *.db-journal
  *.exe
  backups/
  apps/api/dev.db
  apps/api/prisma/dev.db
  .turbo/
  server.log
  server.pid
  
  *.sql
```

## 7. Observatii automate
- 3 foldere node_modules: verifica daca toate sunt necesare.
- Mai multe lockfile-uri.
- 2 fisiere ratacite (arhive/log-uri/baze de date/copii).
