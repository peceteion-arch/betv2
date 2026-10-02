import { z } from 'zod';

// Fail fast at startup rather than silently falling back to '' — an empty
// CRON_SECRET turns the cron routes into an unauthenticated endpoint.
if (!process.env.JWT_SECRET) throw new Error('FATAL: JWT_SECRET not set');
if (!process.env.CRON_SECRET) throw new Error('FATAL: CRON_SECRET not set');
if (!process.env.DATABASE_URL) throw new Error('FATAL: DATABASE_URL not set');

export const env = {
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  PORT: parseInt(process.env.PORT || '3001'),
  FOOTBALL_DATA_API_KEY: process.env.FOOTBALL_DATA_API_KEY || '',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  CRON_SECRET: process.env.CRON_SECRET || '',
};

export const registerSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createGroupSchema = z.object({
  name: z.string().min(2).max(50),
});

export const joinGroupSchema = z.object({
  inviteCode: z.string().length(8),
});

export const placeBetSchema = z.object({
  stake: z.number().min(1).max(10000),
  selections: z.array(z.object({
    matchId: z.string(),
    market: z.string(),
    selection: z.string(),
  })).min(1).max(20),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  email: z.string().email().optional(),
});

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// Accepts a full ISO string ('2026-10-01T20:00:00.000Z') and the naive
// datetime-local value the admin form submits ('2026-10-01T20:00') — the
// latter carries no timezone, so a strict z.string().datetime() would reject
// every match created through the UI.
const matchDateSchema = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: 'Data inválida',
});

export const createManualMatchSchema = z.object({
  homeTeam: z.string().min(2).max(50),
  awayTeam: z.string().min(2).max(50),
  league: z.string().min(2).max(100).default('Minifotbal'),
  matchDate: matchDateSchema,
});

// Recording a result means the match is being played or is over. SCHEDULED is
// deliberately NOT here: it used to be accepted, which let a finished match be
// flipped back to SCHEDULED through the score route and — because placeBet
// only checks SCHEDULED plus a future kick-off — become bettable again.
// POSTPONED/CANCELLED mean the event produced no result and arrive via the feed
// (mapStatus), and VOID has its own route that must not be reachable from here.
export const SCOREABLE_MATCH_STATUSES = ['FINISHED', 'LIVE'] as const;

export const updateScoreSchema = z.object({
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  status: z.enum(SCOREABLE_MATCH_STATUSES).optional().default('FINISHED'),
});
