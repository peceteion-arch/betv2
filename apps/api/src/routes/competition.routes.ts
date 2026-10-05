import { Router } from 'express';
import { competitionService } from '../services/competition.service';
import { authenticate, requireAdmin } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const competitions = await competitionService.list();
    res.json(competitions);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    res.status(500).json({ error: message });
  }
});

router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const competition = await competitionService.create(req.body);
    res.status(201).json(competition);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao criar competição';
    res.status(400).json({ error: message });
  }
});

export default router;