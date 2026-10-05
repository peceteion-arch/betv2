import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const t = await p.team.count();
  const c = await p.competition.count();
  const m = await p.match.count();
  console.log('teams:', t, 'competitions:', c, 'matches:', m);
  await p.$disconnect();
})();
