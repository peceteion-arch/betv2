import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import groupRoutes from './routes/group.routes';
import matchRoutes from './routes/match.routes';
import betRoutes from './routes/bet.routes';
import rankingRoutes from './routes/ranking.routes';
import notificationRoutes from './routes/notification.routes';
import adminRoutes from './routes/admin.routes';
import { matchService } from './services/match.service';
import { betService } from './services/bet.service';
import { env } from './config/env';
import { settleRunning, setSettleRunning } from './lib/settlement-lock';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import { existsSync } from 'fs';
import { join } from 'path';

const app = express();

// Required env vars (JWT_SECRET, CRON_SECRET, DATABASE_URL) are validated at
// startup in config/env.ts — importing it above already throws if any is missing.

const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({ origin: env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests' },
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many auth attempts' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Cron endpoints (protected by CRON_SECRET)
let syncRunning = false;

app.get('/api/cron/sync', async (req: Request, res: Response) => {
  const provided = req.headers.authorization?.replace('Bearer ', '') ?? '';
  if (!provided || provided !== env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (syncRunning) return res.status(409).json({ error: 'Already running' });
  syncRunning = true;
  try {
    const count = await matchService.syncMatches();
    res.json({ ok: true, synced: count });
  } catch (error) {
    res.status(500).json({ error: 'Sync failed' });
  } finally {
    syncRunning = false;
  }
});

app.get('/api/cron/settle', async (req: Request, res: Response) => {
  const provided = req.headers.authorization?.replace('Bearer ', '') ?? '';
  if (!provided || provided !== env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (settleRunning) return res.status(409).json({ error: 'Already running' });
  setSettleRunning(true);
  try {
    await betService.settlePendingBets();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Settlement failed' });
  } finally {
    setSettleRunning(false);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/bets', betRoutes);
app.use('/api/rankings', rankingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static frontend files in production
const webDistPath = join(__dirname, '../../web/dist');
if (existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(webDistPath, 'index.html'));
    }
  });
}

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

// Start server only when not running on Vercel (serverless)
if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API server running on port ${PORT}`);
  });
}

export default app;
