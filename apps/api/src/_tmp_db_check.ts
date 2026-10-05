import { prisma } from './lib/prisma';

async function main() {
  try {
    // 1. PENDING bets that have all their matches in FINISHED status (or finished/voided, i.e., not SCHEDULED/LIVE)
    const pendingBets = await prisma.bet.findMany({
      where: { status: 'PENDING' },
      include: {
        selections: {
          include: {
            match: true
          }
        }
      }
    });

    const fullyFinishedPendingBets = pendingBets.filter(bet =>
      bet.selections.every(sel => sel.match.status === 'FINISHED' || sel.match.status === 'VOID')
    );

    console.log(`JSON_START`);
    console.log(JSON.stringify({
      pendingBetsCount: pendingBets.length,
      fullyFinishedPendingBetsCount: fullyFinishedPendingBets.length,
    }, null, 2));

    // 2. A few sample WON/LOST bets
    const sampleBets = await prisma.bet.findMany({
      where: {
        status: { in: ['WON', 'LOST'] }
      },
      take: 5,
      include: {
        selections: {
          select: {
            id: true,
            odds: true,
            won: true,
            market: true,
            selection: true,
            match: {
              select: {
                homeTeam: true,
                awayTeam: true,
                status: true,
                homeScore: true,
                awayScore: true
              }
            }
          }
        }
      }
    });

    console.log(JSON.stringify(sampleBets.map(bet => ({
      id: bet.id,
      status: bet.status,
      stake: Number(bet.stake),
      totalOdds: Number(bet.totalOdds),
      potentialReturn: Number(bet.potentialReturn),
      selections: bet.selections.map(sel => ({
        market: sel.market,
        selection: sel.selection,
        odds: Number(sel.odds),
        won: sel.won,
        match: sel.match
      }))
    })), null, 2));
    console.log(`JSON_END`);
  } catch (err: any) {
    console.error('Database connection error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
