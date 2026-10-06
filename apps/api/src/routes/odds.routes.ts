import { Router, Request, Response } from 'express';
import { oddsEvents } from '../lib/odds-events';

const router = Router();

router.get('/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Heartbeat
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  const onOddsUpdate = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  oddsEvents.on('oddsUpdate', onOddsUpdate);

  req.on('close', () => {
    clearInterval(heartbeat);
    oddsEvents.removeListener('oddsUpdate', onOddsUpdate);
    res.end();
  });
});

export default router;
