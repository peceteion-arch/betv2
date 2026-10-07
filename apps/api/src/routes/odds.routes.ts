import { Router, Request, Response } from 'express';
import { oddsEvents } from '../lib/odds-events';

const router = Router();

router.get('/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    // Opreste buffering-ul in nginx / proxy-uri inverse, altfel evenimentele
    // ajung la browser doar cand se umple bufferul (sau deloc).
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  // Primul chunk deschide stream-ul imediat si fixeaza intervalul de reconectare
  res.write('retry: 3000\n\n');

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
