import { Router } from 'express';
import { teamService } from '../services/team.service';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const teams = await teamService.list();
    res.json(teams);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    res.status(500).json({ error: message });
  }
});

export default router;