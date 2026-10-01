import { Router } from 'express';
import { matchService } from '../services/match.service';
import { authenticate, requireAdmin } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { createManualMatchSchema, updateScoreSchema } from '../config/env';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const cursor = req.query.cursor as string | undefined;
    const matches = await matchService.listUpcoming(limit, cursor);
    res.json(matches);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    res.status(500).json({ error: message });
  }
});

router.get('/live', authenticate, async (_req: AuthRequest, res) => {
  try {
    const matches = await matchService.listLive();
    res.json(matches);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    res.status(500).json({ error: message });
  }
});

// Must stay above GET /:id — Express matches in registration order, so a
// literal route defined after /:id would never be reached.
router.get('/all', authenticate, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const matches = await matchService.listAll();
    res.json(matches);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    res.status(500).json({ error: message });
  }
});

router.post('/manual', authenticate, requireAdmin, validate(createManualMatchSchema), async (req: AuthRequest, res) => {
  try {
    const match = await matchService.createManual(req.body);
    res.status(201).json(match);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao criar jogo';
    res.status(400).json({ error: message });
  }
});

router.patch('/:id/score', authenticate, requireAdmin, validate(updateScoreSchema), async (req: AuthRequest, res) => {
  try {
    const match = await matchService.updateScore(req.params.id, req.body);
    res.json(match);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao atualizar resultado';
    res.status(400).json({ error: message });
  }
});

// VOID is kept on its own route rather than folded into /:id/score: a void
// means "this event produced no playable result", which is a different act
// from recording a result. It must never invent a 0-0 score.
router.patch('/:id/void', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const match = await matchService.voidMatch(req.params.id);
    res.json(match);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao marcar jogo como VOID';
    res.status(400).json({ error: message });
  }
});

router.patch('/:id/unvoid', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const match = await matchService.unvoidMatch(req.params.id);
    res.json(match);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao anular marcação VOID';
    res.status(400).json({ error: message });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await matchService.deleteMatch(req.params.id);
    if (!result.deleted) {
      return res.status(409).json({ error: 'Não é possível eliminar: existem apostas neste jogo' });
    }
    return res.json({ message: 'Jogo eliminado' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao eliminar jogo';
    res.status(400).json({ error: message });
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const match = await matchService.getById(req.params.id);
    res.json(match);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Jogo não encontrado';
    res.status(404).json({ error: message });
  }
});

router.post('/sync', authenticate, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const count = await matchService.syncMatches();
    res.json({ message: `Synced ${count} matches` });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    res.status(500).json({ error: message });
  }
});

router.post('/sync-odds', authenticate, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const count = await matchService.applyScrapedOdds();
    res.json({ message: `Applied scraped odds to ${count} matches` });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    res.status(500).json({ error: message });
  }
});

export default router;
