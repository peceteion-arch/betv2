import { Router, Response, NextFunction } from 'express';
import { competitionService } from '../services/competition.service';
import { authenticate, requireAdmin } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { uploadCompetitionLogo } from '../lib/upload';
import { prisma } from '../lib/prisma';
import { unlink } from 'fs/promises';

const router = Router();

const checkCompetitionExists = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const competition = await prisma.competition.findUnique({ where: { id } });
    if (!competition) {
      return res.status(404).json({ error: 'Competiția nu există' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Erro interno' });
  }
};

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

router.patch('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const competition = await competitionService.update(id, req.body);
    res.json(competition);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    res.status(400).json({ error: message });
  }
});

router.patch('/:id/status', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;

    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'Active must be a boolean' });
    }

    const competition = await competitionService.updateStatus(id, active);
    res.json(competition);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    res.status(400).json({ error: message });
  }
});

router.post('/:id/logo', authenticate, requireAdmin, checkCompetitionExists, (req: AuthRequest, res: Response, next: NextFunction) => {
  uploadCompetitionLogo.single('logo')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'Niciun fișier nu a fost încărcat' });
    }

    const logoUrl = `/uploads/competition-logos/${req.file.filename}`;
    const competition = await competitionService.update(id, { logoUrl });
    
    res.json(competition);
  } catch (error: unknown) {
    // Cleanup: delete uploaded file if DB update failed
    if (req.file && req.file.path) {
      try {
        await unlink(req.file.path);
        console.log(`Cleaned up uploaded file: ${req.file.path}`);
      } catch (unlinkError) {
        console.error(`Failed to cleanup uploaded file ${req.file.path}:`, unlinkError);
        // Do not mask the original error
      }
    }
    const message = error instanceof Error ? error.message : 'Erro interno';
    res.status(500).json({ error: message });
  }
});

export default router;