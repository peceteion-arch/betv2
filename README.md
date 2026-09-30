<div align="center">

# ⚽ betNANDO

### Virtual Football Betting Platform for Friend Groups

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933.svg)](https://nodejs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.14-2D3748.svg)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4.svg)](https://tailwindcss.com/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000.svg)](https://vercel.com)
[![Supabase](https://img.shields.io/badge/Database-Supabase-3FCF8E.svg)](https://supabase.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

**A full-stack virtual football betting platform where friends compete with virtual credits on real matches. Built with modern web technologies.**

[🚀 Quick Start](#-quick-start) | [📖 API Docs](#-api-endpoints) | [🎯 Features](#-features) | [🛠️ Tech Stack](#-tech-stack) | [🌐 Live Demo](#-live-demo)

---

### 🏷️ Topics

```
football betting soccer virtual-betting fantasy-football sports react nodejs typescript prisma postgresql tailwindcss express vite vercel supabase open-source webdev fullstack saas portfolio project api restapi jwt authentication frontend backend devops docker pwa betting-platform friend-group social-betting
```

</div>

---

## 🌐 Live Demo

🔗 **[betnando.vercel.app](https://betnando.vercel.app)**

> ⚠️ Free tier deployment. First load may take 30-60 seconds (cold start).

### Test Credentials

| Role | Email | Password |
|------|-------|----------|
| 👑 Admin | admin@betnando.com | admin123 |
| 👤 User | joao@example.com | password123 |
| 👤 User | maria@example.com | password123 |

---

## 💡 Why betNANDO?

> "I wanted to build a real-world full-stack application that demonstrates modern web development practices while solving a fun problem: how friend groups can bet on football matches without risking real money."

### What Makes This Project Special

| Aspect | Description |
|--------|-------------|
| 🏗️ **Production-Ready** | Not a tutorial project — this is a complete, deployable application |
| 🔒 **Security First** | JWT auth, bcrypt hashing, rate limiting, input validation, CORS |
| 📱 **PWA Ready** | Installable on mobile/desktop, offline fallback, service worker |
| 🎯 **11 Betting Markets** | Real betting logic with odds generation and automatic settlement |
| 🏆 **Social Features** | Groups, rankings, notifications — not just a solo experience |
| 📚 **API Documentation** | Swagger/OpenAPI docs out of the box |
| 🧪 **Tested** | 30 unit tests covering schemas, settlement logic, and environment config |
| 🚀 **Deploy Anywhere** | Vercel, Render, Fly.io, Docker — multiple deployment options |

---

## 📐 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      BETNANDO ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │   🖥️ Frontend   │     │   ⚙️ Backend    │                    │
│  │   React + Vite  │────▶│   Express.js    │                    │
│  │   Port 5555     │     │   Port 3001     │                    │
│  └─────────────────┘     └────────┬────────┘                    │
│                                   │                              │
│                    ┌──────────────┼──────────────┐              │
│                    │              │              │              │
│                    ▼              ▼              ▼              │
│           ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │
│           │  🗄️ PostgreSQL│ │  🔐 JWT     │ │  📡 Football│      │
│           │  (Supabase) │ │  Auth       │ │  Data API   │      │
│           └─────────────┘ └─────────────┘ └─────────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 🔄 How It Works

```
1. User registers → Gets 100 virtual credits
2. Browse matches → View odds for 11 betting markets
3. Build bet slip → Combine up to 20 selections
4. Place bet → Stake deducted, odds locked from DB
5. Match settles → System checks results, pays winners
6. Climb rankings → Compete with friends in groups
```

---

## 🎯 What Actually Works

### ✅ Fully Implemented

| Feature | Status | Details |
|---------|--------|---------|
| 🔐 **JWT Authentication** | ✅ Working | Login, register, password hashing (bcrypt), token refresh |
| 👥 **Groups System** | ✅ Working | Create, join via invite code (8-char hex), max 50 members, group rankings |
| ⚽ **Match Browser** | ✅ Working | Upcoming/live matches, cursor pagination, match details |
| 🎰 **11 Betting Markets** | ✅ Working | 1X2, Double Chance, Over/Under (0.5-4.5), BTTS, Half-time, Correct Score, Odd/Even |
| 🎫 **Bet Slips** | ✅ Working | Multi-selection bets (max 20), combined odds, stake presets |
| 💰 **Virtual Wallet** | ✅ Working | 100 starting credits, balance tracking, profit/ROI stats |
| 🏆 **Rankings** | ✅ Working | Global top 50 + group leaderboards sorted by balance |
| 📊 **Statistics** | ✅ Working | Win rate, profit, ROI, total bets, wins, losses |
| 🔔 **Notifications** | ✅ Working | In-app notifications (bet placed/won/lost/cancelled), mark read |
| 👑 **Admin Panel** | ✅ Working | Stats dashboard, user CRUD, group management, manual sync |
| 📱 **PWA** | ✅ Working | Installable, offline fallback, service worker, iOS detection |
| 📚 **Swagger Docs** | ✅ Working | OpenAPI 3.0 at `/api/docs` |
| 🛡️ **Security** | ✅ Working | Rate limiting, input validation (Zod), CORS, Helmet |

### ⚠️ Partially Working

| Feature | Status | Details |
|---------|--------|---------|
| 📡 **Football Data API** | ⚠️ API key expired | Falls back to hardcoded World Cup matches |
| 🔄 **Match Sync** | ⚠️ Depends on API | Needs valid `FOOTBALL_DATA_API_KEY` or uses fallback |
| 🎲 **Odds Generation** | ⚠️ Estimated only | Auto-generates odds with jitter, no real market data |

### ❌ Not Implemented

| Feature | Status | Details |
|---------|--------|---------|
| 📡 **Real-time Updates** | ❌ Not built | No WebSockets/SSE, uses 30s polling for notifications |
| 📧 **Email Notifications** | ❌ Not built | In-app only, no email/SMS/push delivery |
| 🔑 **Password Reset** | ❌ Not built | No forgot password flow |
| 🌐 **OAuth Login** | ❌ Not built | Email/password only |
| 🔍 **Search** | ❌ Not built | No match/user search functionality |
| ✏️ **Edit Bets** | ❌ Not built | Can only cancel pending bets, not modify |
| 📈 **Live Odds** | ❌ Not built | Odds are static once generated |

---

## 🎰 Betting Markets

### Auto-Generated Odds (11 markets)

| Market | Selections | Example Odds |
|--------|------------|--------------|
| **1X2** | Home, Draw, Away | 1.90, 3.50, 3.80 |
| **Double Chance** | 1X, X2, 12 | 1.30, 1.80, 1.25 |
| **Over/Under 0.5** | Over, Under | 1.08, 9.50 |
| **Over/Under 1.5** | Over, Under | 1.35, 3.20 |
| **Over/Under 2.5** | Over, Under | 1.85, 1.95 |
| **Over/Under 3.5** | Over, Under | 2.60, 1.50 |
| **Over/Under 4.5** | Over, Under | 3.40, 1.30 |
| **BTTS** | Yes, No | 1.75, 2.05 |
| **Half-time Result** | Home, Draw, Away | 2.80, 2.20, 3.60 |
| **Correct Score** | 9 outcomes | 5.50 - 12.00 |
| **Odd/Even** | Odd, Even | 1.90, 1.90 |

### Scraped Odds (via `odds.json`)

| Market | Description |
|--------|-------------|
| Handicap ±0.5, ±1.5 | Asian handicap |
| Total Goals 0-6 | Exact goal count |

---

## 🛠️ Tech Stack

<table>
<tr>
<td><strong>Frontend</strong></td>
<td><strong>Backend</strong></td>
<td><strong>Database</strong></td>
<td><strong>DevOps</strong></td>
</tr>
<tr>
<td>

- ⚛️ React 18.3
- 📦 Vite 5.2
- 🎨 Tailwind CSS 3.4
- 🗃️ Zustand 4.5
- 🌐 React Router 6
- 📡 Axios 1.7
- 📱 PWA (Service Worker)

</td>
<td>

- 🟢 Node.js 20
- 🚂 Express 4.19
- 🔐 JWT + bcrypt
- 📝 Zod Validation
- 📚 Swagger/OpenAPI
- 🛡️ Helmet + CORS

</td>
<td>

- 💾 SQLite (Dev)
- 🗄️ PostgreSQL (Prod)
- 🔧 Prisma ORM 5.14

</td>
<td>

- 🐳 Docker Compose
- ⚡ Turborepo
- 🧪 Vitest
- 📝 ESLint + Prettier

</td>
</tr>
</table>

---

## ⚡ Quick Start

### Prerequisites

- Node.js 20+
- Docker (optional, for PostgreSQL)

### 🐳 Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/fernando053/betNANDO.git
cd betNANDO

# Start PostgreSQL + API + Web
docker-compose up -d

# Create tables
npx prisma db push

# Seed test data
npx prisma db seed
```

### 🔧 Manual Setup

```bash
# Clone the repository
git clone https://github.com/fernando053/betNANDO.git
cd betNANDO

# Install dependencies
npm install

# Setup database
cd apps/api
cp .env.example .env
# Edit .env with your DATABASE_URL

# Create tables and seed data
npx prisma db push
npx tsx prisma/seed.ts

# Start development
cd ../..
npm run dev
```

### 📱 Access

| Service | URL |
|---------|-----|
| 🌐 Frontend | http://localhost:5555 |
| ⚙️ API | http://localhost:3001 |
| 📚 Swagger Docs | http://localhost:3001/api/docs |
| 🩺 Health Check | http://localhost:3001/api/health |

### 🔑 Test Credentials

| Role | Email | Password |
|------|-------|----------|
| 👑 Admin | admin@betnando.com | admin123 |
| 👤 User | joao@example.com | password123 |
| 👤 User | maria@example.com | password123 |
| 👤 User | pedro@example.com | password123 |

**Group invite code:** `TESTCODE`

---

## 📁 Project Structure

```
betNANDO/
├── 📂 apps/
│   ├── 📂 api/                    # Express Backend
│   │   ├── 📂 prisma/
│   │   │   ├── schema.prisma      # Database schema (8 models)
│   │   │   └── seed.ts            # Test data seeder
│   │   ├── 📂 src/
│   │   │   ├── 📂 config/         # Env, Swagger config
│   │   │   ├── 📂 jobs/           # Cron jobs (sync, settle)
│   │   │   ├── 📂 middleware/     # Auth, Validation
│   │   │   ├── 📂 routes/         # 8 route files
│   │   │   ├── 📂 services/       # 8 service files
│   │   │   ├── 📂 lib/            # Prisma client
│   │   │   └── index.ts           # Entry point
│   │   ├── 📂 tests/              # 17 API tests
│   │   └── package.json
│   │
│   └── 📂 web/                    # React Frontend
│       ├── 📂 src/
│       │   ├── 📂 components/     # BetSlip, Layout, Navbar
│       │   ├── 📂 pages/          # 14 page components
│       │   ├── 📂 hooks/          # useIOS detection
│       │   ├── 📂 lib/            # API client, Auth context
│       │   ├── 📂 store/          # Zustand bet slip store
│       │   └── main.tsx           # Entry point
│       ├── 📂 public/             # PWA assets, icons
│       ├── 📂 tests/              # 3 Web tests
│       └── package.json
│
├── 📄 docker-compose.yml          # PostgreSQL + API + Web
├── 📄 turbo.json                  # Monorepo config
├── 📄 .eslintrc.json              # Linting
└── 📄 .prettierrc                 # Formatting
```

---

## 📡 API Endpoints

<details>
<summary><strong>🔐 Authentication (2 endpoints)</strong></summary>

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | Public | Register new user (100 CR free) |
| POST | `/api/auth/login` | Public | Login with email/password |

</details>

<details>
<summary><strong>👤 Users (3 endpoints)</strong></summary>

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/users/me` | JWT | Get current user profile |
| PATCH | `/api/users/me` | JWT | Update profile (name, email) |
| POST | `/api/users/change-password` | JWT | Change password |

</details>

<details>
<summary><strong>👥 Groups (4 endpoints)</strong></summary>

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/groups` | JWT | Create group (auto-generates invite code) |
| POST | `/api/groups/join` | JWT | Join group via 8-char invite code |
| GET | `/api/groups` | JWT | List user's groups |
| GET | `/api/groups/:id` | JWT | Group detail + members ranked by balance |
| DELETE | `/api/groups/:id` | JWT | Delete group (owner only) |

</details>

<details>
<summary><strong>⚽ Matches (5 endpoints)</strong></summary>

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/matches` | JWT | Upcoming matches (cursor pagination) |
| GET | `/api/matches/live` | JWT | Live/started matches |
| GET | `/api/matches/:id` | JWT | Match detail + all odds |
| POST | `/api/matches/sync` | Admin | Sync matches from football-data.org |
| POST | `/api/matches/sync-odds` | Admin | Apply scraped odds from odds.json |

</details>

<details>
<summary><strong>🎰 Bets (5 endpoints)</strong></summary>

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/bets` | JWT | Place bet (max 20 selections) |
| GET | `/api/bets` | JWT | List user's bets (cursor pagination) |
| GET | `/api/bets/active` | JWT | List pending bets |
| GET | `/api/bets/:id` | JWT | Get bet detail |
| POST | `/api/bets/:id/cancel` | JWT | Cancel pending bet (refunds stake) |
| POST | `/api/bets/settle` | Admin | Manual settlement trigger |

</details>

<details>
<summary><strong>🏆 Rankings (2 endpoints)</strong></summary>

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/rankings/global` | JWT | Global top 50 by balance |
| GET | `/api/rankings/group/:id` | JWT | Group rankings |

</details>

<details>
<summary><strong>🔔 Notifications (4 endpoints)</strong></summary>

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/notifications` | JWT | List notifications (max 50) |
| GET | `/api/notifications/unread-count` | JWT | Get unread count |
| PATCH | `/api/notifications/:id/read` | JWT | Mark as read |
| POST | `/api/notifications/read-all` | JWT | Mark all as read |

</details>

<details>
<summary><strong>👑 Admin (8 endpoints)</strong></summary>

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/stats` | Admin | Dashboard statistics |
| GET | `/api/admin/users` | Admin | List all users (paginated) |
| POST | `/api/admin/users` | Admin | Create user with custom balance |
| PATCH | `/api/admin/users/:id` | Admin | Update user (balance, block, role) |
| DELETE | `/api/admin/users/:id` | Admin | Delete user |
| GET | `/api/admin/groups` | Admin | List all groups |
| DELETE | `/api/admin/groups/:id` | Admin | Delete group |
| POST | `/api/admin/sync-matches` | Admin | Force match sync |

</details>

<details>
<summary><strong>🔄 Cron (2 endpoints)</strong></summary>

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/cron/sync` | Bearer | Sync matches (for external cron) |
| GET | `/api/cron/settle` | Bearer | Settle pending bets (for external cron) |
| GET | `/api/health` | Public | Health check |

</details>

---

## ⚙️ Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `DATABASE_URL` | ✅ | PostgreSQL/SQLite connection string | - |
| `JWT_SECRET` | ✅ | JWT signing secret | - |
| `JWT_EXPIRES_IN` | ❌ | Token expiration | `7d` |
| `PORT` | ❌ | Server port | `3001` |
| `FOOTBALL_DATA_API_KEY` | ❌ | Football-Data.org API key (expired) | - |
| `FRONTEND_URL` | ❌ | CORS allowed origin | `http://localhost:5173` |
| `CRON_SECRET` | ❌ | Secret for cron endpoints | - |

---

## 🧪 Testing

```bash
# Run all tests (30 total)
npm test

# Run API tests only (27 tests)
npm run test:api

# Run Web tests only (3 tests)
npm run test:web
```

### Test Coverage

| Suite | Tests | What's Tested |
|-------|-------|---------------|
| `schemas.test.ts` | 5 | Zod validation schemas |
| `bet-logic.test.ts` | 11 | Bet settlement logic (all markets) |
| `env.test.ts` | 11 | Environment config, validation |
| `localStorage.test.ts` | 2 | localStorage browser mock |
| `hooks.test.ts` | 1 | Hook exports |

---

## 📊 Database Schema

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    User     │────▶│    Group    │◀────│ GroupMember  │
│             │     │             │     │             │
│ • balance   │     │ • name      │     │ • groupId   │
│ • betsCount │     │ • inviteCode│     │ • userId    │
│ • betsWon   │     │ • adminId   │     │ • joinedAt  │
│ • roi       │     └─────────────┘     └─────────────┘
│ • profit    │
│ • role      │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│     Bet     │────▶│BetSelection │◀────│    Match    │
│             │     │             │     │             │
│ • stake     │     │ • market    │     │ • homeTeam  │
│ • totalOdds │     │ • selection │     │ • awayTeam  │
│ • potential │     │ • odds      │     │ • status    │
│ • status    │     │ • won       │     │ • matchDate │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │    Odds     │
                                        │             │
                                        │ • market    │
                                        │ • selection │
                                        │ • value     │
                                        │ • source    │
                                        └─────────────┘
```

---

## 🚀 Deploy

### Free Options (No Credit Card)

| Platform | Type | Limitations |
|----------|------|-------------|
| **Vercel** | Serverless | 10s timeout, no persistent cron |
| **Render.com** | Web Service | 15min spin-down on free tier |
| **Supabase** | PostgreSQL | 500MB storage, 500K rows |

### Deploy Architecture (Vercel + Supabase)

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐
│     🌐 Vercel    │     │   🗄️ Supabase    │     │ cron-job.org │
│   (Frontend +    │────▶│   (PostgreSQL)   │     │   (Triggers) │
│    API Server)   │     │                  │     │              │
└──────────────────┘     └──────────────────┘     └──────┬───────┘
                                                         │
                              ┌──────────────────────────┘
                              │ Ping every 30min/2min
                              ▼
                       ┌──────────────┐
                       │ /api/cron/*  │
                       └──────────────┘
```

📖 **Complete guide:** See [DEPLOY.md](DEPLOY.md)

---

## 🌟 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=fernando053/betNANDO&type=Date)](https://star-history.com/#fernando053/betNANDO&Date)

---

## 🤝 Contributing

Contributions are welcome! This project is a great way to learn full-stack development.

### How to Contribute

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/betNANDO.git`
3. **Create** a feature branch: `git checkout -b feature/amazing-feature`
4. **Make** your changes
5. **Test** your changes: `npm test`
6. **Commit** your changes: `git commit -m 'Add amazing feature'`
7. **Push** to the branch: `git push origin feature/amazing-feature`
8. **Open** a Pull Request

### Good First Issues

- [ ] Add dark/light theme toggle
- [ ] Add match search functionality
- [ ] Add export betting history to CSV
- [ ] Add multi-language support (PT, EN, ES)
- [ ] Add push notifications
- [ ] Add WebSocket for real-time updates

---

## 📊 Project Stats

<div align="center">

![GitHub commit activity](https://img.shields.io/github/commit-activity/w/fernando053/betNANDO)
![GitHub code size](https://img.shields.io/github/languages/code-size/fernando053/betNANDO)
![GitHub repo size](https://img.shields.io/github/repo-size/fernando053/betNANDO)
![GitHub top language](https://img.shields.io/github/languages/top/fernando053/betNANDO)

</div>

---

## 📢 Share This Project

Help spread the word! Share on your favorite platform:

**Twitter/X:**
```
⚽ Built betNANDO - a full-stack virtual football betting platform!

Tech: React + TypeScript + Node.js + Prisma + PostgreSQL

Features:
✅ 11 betting markets
✅ Group competitions
✅ PWA support
✅ Swagger API docs
✅ 30+ tests

100% free & open source! 🚀

#100DaysOfCode #WebDev #React #NodeJS #TypeScript #OpenSource
```

**LinkedIn:**
```
🚀 Excited to share my latest project: betNANDO!

A full-stack virtual football betting platform built with:
⚛️ React 18 + TypeScript
🟢 Node.js + Express
🗄️ PostgreSQL + Prisma ORM
🎨 Tailwind CSS
🚀 Deployed on Vercel

Key features:
• 11 betting markets with auto-generated odds
• Group system with invite codes
• Real-time rankings and statistics
• PWA with offline support
• Complete API documentation

Check it out: github.com/fernando053/betNANDO

#softwareengineering #webdevelopment #react #nodejs #typescript
```

**Reddit (r/webdev, r/reactjs, r/node):**
```
I built a full-stack football betting platform for friend groups

Hey everyone! I wanted to share a project I've been working on - betNANDO, a virtual football betting platform where friends can compete with virtual credits on real matches.

Tech stack:
- Frontend: React 18 + TypeScript + Tailwind CSS
- Backend: Node.js + Express + Prisma
- Database: PostgreSQL
- Deploy: Vercel + Supabase

What I learned:
- Full-stack TypeScript development
- JWT authentication and authorization
- Database design with Prisma ORM
- PWA implementation
- API documentation with Swagger

The project is 100% free and open source. Would love to get your feedback!

GitHub: https://github.com/fernando053/betNANDO
```

---

## 🎯 Roadmap

- [ ] Real-time match updates with WebSockets
- [ ] Live betting during matches
- [ ] Push notifications
- [ ] Mobile app (React Native)
- [ ] AI-powered betting tips
- [ ] Multi-language support (PT, EN, ES)
- [ ] Dark/Light theme toggle
- [ ] Export betting history to CSV/PDF
- [ ] Integration with more football APIs
- [ ] Tournament mode with brackets

---

## ⚠️ Disclaimer

This is a **virtual betting platform** for educational and entertainment purposes only. No real money is involved. Please bet responsibly.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

### 🙏 Support

If you find this project useful, please consider:

- ⭐ **Starring** the repository
- 🐛 **Reporting** bugs
- 💡 **Suggesting** features
- 🤝 **Contributing** code
- 📢 **Sharing** with others

---

**Made with ⚽ and ❤️ for football friends worldwide**

[⬆ Back to Top](#-betNANDO)

</div>
=======
# betv2
betting script for platinum league

