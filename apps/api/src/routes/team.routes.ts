import { Router } from 'express';
import { teamService } from '../services/team.service';
import { authenticate, requireAdmin } from '../middleware/auth';
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

router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const team = await teamService.create(req.body);
    res.status(201).json(team);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao criar equipa';
    res.status(400).json({ error: message });
  }
});

router.patch('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const team = await teamService.update(req.params.id, req.body);
    res.status(200).json(team);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao atualizar equipa';
    res.status(400).json({ error: message });
  }
});

export default router;