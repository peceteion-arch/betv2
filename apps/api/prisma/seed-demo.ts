import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 1. Compețiție
  const comp = await prisma.competition.upsert({
    where: { name: 'Liga Demo Galați' },
    update: {},
    create: { name: 'Liga Demo Galați', active: true },
  });

  // 2. Echipe
  const teamNames = [
    'FC Fulger','Atletic Nord','Dunărea City','Sporting Sud',
    'Vulturii','Progresul','Rapid Arena','Unirea Nouă',
  ];
  const teamIdByName: Record<string, string> = {};
  for (const t of teamNames) {
    const team = await prisma.team.upsert({
      where: { name: t },
      update: {},
      create: { name: t },
    });
    teamIdByName[t] = team.id;
  }

  // 3. Meciuri — round-robin determinist (28 meciuri, 4/etapă, 7 etape)
  const fixtures = [
    // Stage 1 — 2025-03-01
    { stage:1, home:'FC Fulger', away:'Unirea Nouă', h:3, a:0 },
    { stage:1, home:'Atletic Nord', away:'Rapid Arena', h:2, a:1 },
    { stage:1, home:'Dunărea City', away:'Progresul', h:2, a:0 },
    { stage:1, home:'Sporting Sud', away:'Vulturii', h:1, a:1 },
    // Stage 2 — 2025-03-08
    { stage:2, home:'FC Fulger', away:'Rapid Arena', h:2, a:0 },
    { stage:2, home:'Progresul', away:'Unirea Nouă', h:1, a:1 },
    { stage:2, home:'Atletic Nord', away:'Vulturii', h:2, a:1 },
    { stage:2, home:'Dunărea City', away:'Sporting Sud', h:3, a:1 },
    // Stage 3 — 2025-03-15
    { stage:3, home:'FC Fulger', away:'Progresul', h:4, a:1 },
    { stage:3, home:'Rapid Arena', away:'Vulturii', h:0, a:3 },
    { stage:3, home:'Sporting Sud', away:'Unirea Nouă', h:2, a:3 },
    { stage:3, home:'Atletic Nord', away:'Dunărea City', h:2, a:2 },
    // Stage 4 — 2025-03-22
    { stage:4, home:'FC Fulger', away:'Vulturii', h:2, a:2 },
    { stage:4, home:'Progresul', away:'Sporting Sud', h:1, a:2 },
    { stage:4, home:'Dunărea City', away:'Rapid Arena', h:2, a:1 },
    { stage:4, home:'Atletic Nord', away:'Unirea Nouă', h:3, a:0 },
    // Stage 5 — 2025-03-29
    { stage:5, home:'FC Fulger', away:'Sporting Sud', h:3, a:1 },
    { stage:5, home:'Dunărea City', away:'Vulturii', h:1, a:1 },
    { stage:5, home:'Atletic Nord', away:'Progresul', h:2, a:0 },
    { stage:5, home:'Rapid Arena', away:'Unirea Nouă', h:1, a:4 },
    // Stage 6 — 2025-04-05
    { stage:6, home:'Dunărea City', away:'FC Fulger', h:1, a:2 },
    { stage:6, home:'Atletic Nord', away:'Sporting Sud', h:2, a:1 },
    { stage:6, home:'Unirea Nouă', away:'Vulturii', h:1, a:2 },
    { stage:6, home:'Progresul', away:'Rapid Arena', h:1, a:2 },
    // Stage 7 — 2025-04-12
    { stage:7, home:'Atletic Nord', away:'FC Fulger', h:1, a:2 },
    { stage:7, home:'Dunărea City', away:'Unirea Nouă', h:3, a:0 },
    { stage:7, home:'Rapid Arena', away:'Sporting Sud', h:0, a:2 },
    { stage:7, home:'Progresul', away:'Vulturii', h:1, a:2 },
  ];

  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    const date = new Date(`2025-03-${String(1 + (f.stage-1)*7).padStart(2,'0')}T18:00:00Z`);
    // Ensure dates ordered: stage1=01, 2=08, 3=15, 4=22, 5=29, 6=05(apr), 7=12(apr)
    const baseDates = ['2025-03-01','2025-03-08','2025-03-15','2025-03-22','2025-03-29','2025-04-05','2025-04-12'];
    const matchDate = new Date(baseDates[f.stage-1] + 'T18:00:00Z');
    await prisma.match.upsert({
      where: { externalId: `demo-match-${String(i+1).padStart(2,'0')}` },
      update: {},
      create: {
        externalId: `demo-match-${String(i+1).padStart(2,'0')}`,
        homeTeamId: teamIdByName[f.home]!,
        awayTeamId: teamIdByName[f.away]!,
        competitionId: comp.id,
        league: 'Liga Demo Galați',
        matchday: f.stage,
        matchDate,
        status: 'FINISHED',
        homeScore: f.h,
        awayScore: f.a,
      },
    });
  }

  console.log('Demo seed complete: comp=' + comp.id + ', teams=' + teamNames.length + ', matches=' + fixtures.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
