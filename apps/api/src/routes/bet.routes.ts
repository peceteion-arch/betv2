import { Router } from 'express';
import { betService, BetCancelConflictError } from '../services/bet.service';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { placeBetSchema, paginationSchema } from '../config/env';
import { AuthRequest } from '../middleware/auth';
import { settleRunning, setSettleRunning } from '../lib/settlement-lock';

const router = Router();

router.post('/', authenticate, validate(placeBetSchema), async (req: AuthRequest, res) => {
  try {
    const bet = await betService.placeBet(req.userId!, req.body.stake, req.body.selections);
    res.status(201).json(bet);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao colocar aposta';
    res.status(400).json({ error: message });
  }
});

router.get('/', authenticate, validate(paginationSchema), async (req: AuthRequest, res) => {
  try {
    const status = req.query.status as string | undefined;
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string) || 20;
    const bets = await betService.listByUser(req.userId!, status, cursor, limit);
    res.json(bets);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    res.status(500).json({ error: message });
  }
});

router.get('/active', authenticate, validate(paginationSchema), async (req: AuthRequest, res) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string) || 20;
    const bets = await betService.listByUser(req.userId!, 'PENDING', cursor, limit);
    res.json(bets);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    res.status(500).json({ error: message });
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const bet = await betService.getById(req.params.id, req.userId!);
    res.json(bet);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Aposta não encontrada';
    res.status(404).json({ error: message });
  }
});

router.post('/:id/cancel', authenticate, async (req: AuthRequest, res) => {
  try {
    const bet = await betService.cancel(req.params.id, req.userId!);
    res.json(bet);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao colocar aposta';
    // A started match is a conflict, not a malformed request: the ticket is
    // well-formed and the caller owns it, it is simply no longer cancellable.
    // 400 would invite a retry that can never succeed.
    if (error instanceof BetCancelConflictError) {
      return res.status(409).json({ error: message });
    }
    res.status(400).json({ error: message });
  }
});

// Manual settlement trigger (admin only)
// The lock itself lives in lib/settlement-lock.ts so this route and the cron
// endpoint in index.ts cannot run settlement concurrently.
router.post('/settle', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  if (settleRunning) return res.status(409).json({ error: 'Already running' });
  setSettleRunning(true);
  try {
    await betService.settlePendingBets();
    res.json({ message: 'Settlement executado' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    res.status(500).json({ error: message });
  } finally {
    setSettleRunning(false);
  }
});

export default router;
