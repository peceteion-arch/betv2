import { z } from 'zod';

if (!process.env.JWT_SECRET) throw new Error('FATAL: JWT_SECRET not set');
if (!process.env.CRON_SECRET) throw new Error('FATAL: CRON_SECRET not set');
if (!process.env.DATABASE_URL) throw new Error('FATAL: DATABASE_URL not set');

export const env = {
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  PORT: parseInt(process.env.PORT || '3001'),
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

export const updateOddsSchema = z.object({
  changes: z.array(z.object({
    market: z.string(),
    selection: z.string(),
    value: z.number().min(1.01).max(1000).optional(),
    enabled: z.boolean().optional(),
  })).min(1),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  email: z.string().email().optional(),
});

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const matchDateSchema = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: 'Data inválida',
});

export const createManualMatchSchema = z.object({
  homeTeamId: z.string(),
  awayTeamId: z.string(),
  competitionId: z.preprocess((val) => (typeof val === 'string' && val.trim() === '' ? undefined : val), z.string().optional()),
  league: z.preprocess((val) => (typeof val === 'string' && val.trim() === '' ? undefined : val), z.string().optional()),
  matchday: z.number().int().min(1),
  matchDate: matchDateSchema,
});

export const SCOREABLE_MATCH_STATUSES = ['FINISHED', 'LIVE'] as const;

export const updateScoreSchema = z.object({
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  status: z.enum(SCOREABLE_MATCH_STATUSES).optional().default('FINISHED'),
});

export const updateMatchSchema = z.object({
  homeTeamId: z.string(),
  awayTeamId: z.string(),
  competitionId: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().optional()
  ),
  matchday: z.number().int().min(1),
  matchDate: matchDateSchema,
}).refine((data) => data.homeTeamId !== data.awayTeamId, {
  message: 'Echipa gazdă și echipa oaspete trebuie să fie diferite',
  path: ['homeTeamId'],
});