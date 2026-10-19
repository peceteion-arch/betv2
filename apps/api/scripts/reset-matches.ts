/**
 * Resets all match-related data so the CSV import can start from zero.
 *
 *   npm run reset:matches            -> DRY RUN (default): prints what would be deleted
 *   npm run reset:matches -- --confirm  -> actually deletes
 *
 * Deletes, in one transaction and in FK-safe order:
 *   bet_selections -> bets -> odds_changes -> odds -> matches -> notifications
 *
 * Notifications: all existing notification types are bet-related
 * (BET_CREATED / BET_LOST / BET_WON, see bet.service.ts). Since we delete every
 * bet, all notifications are deleted as well (they all reference a user whose
 * stats are being reset to the schema defaults).
 *
 * Because every bet is deleted, each user's stats are reset to the schema
 * defaults: balance=100, betsCount=0, betsWon=0, roi=0, profit=0.
 *
 * NOT touched: users (only stats reset), groups, group_members, teams,
 * competitions.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const confirm = process.argv.includes('--confirm');

  const matchIds = (await prisma.match.findMany({ select: { id: true } })).map((m) => m.id);
  const betIds = (await prisma.bet.findMany({ select: { id: true } })).map((b) => b.id);

  const counts = {
    betSelections: matchIds.length === 0 ? 0 : await prisma.betSelection.count({ where: { matchId: { in: matchIds } } }),
    bets: betIds.length,
    oddsChanges: matchIds.length === 0 ? 0 : await prisma.oddsChange.count({ where: { matchId: { in: matchIds } } }),
    odds: matchIds.length === 0 ? 0 : await prisma.odds.count({ where: { matchId: { in: matchIds } } }),
    matches: matchIds.length,
    notifications: await prisma.notification.count(),
  };

  console.log('=== RESET MATCHES (dry-run) ===');
  console.log('Rows that would be deleted:');
  for (const [table, n] of Object.entries(counts)) {
    console.log(`  ${table}: ${n}`);
  }

  if (!confirm) {
    console.log('\nDry run finished. Nothing was modified.');
    console.log('Re-run with --confirm to actually delete:');
    console.log('  npm run reset:matches -- --confirm');
    return;
  }

  console.log('\n--confirm passed. Executing in a single transaction...');

  await prisma.$transaction(async (tx) => {
    if (matchIds.length > 0) {
      await tx.betSelection.deleteMany({ where: { matchId: { in: matchIds } } });
    }
    await tx.bet.deleteMany({});
    if (matchIds.length > 0) {
      await tx.oddsChange.deleteMany({ where: { matchId: { in: matchIds } } });
      await tx.odds.deleteMany({ where: { matchId: { in: matchIds } } });
      await tx.match.deleteMany({ where: { id: { in: matchIds } } });
    }
    await tx.notification.deleteMany({});

    // Reset user stats to schema defaults now that all bets are gone.
    await tx.user.updateMany({
      where: {},
      data: {
        balance: 100,
        betsCount: 0,
        betsWon: 0,
        roi: 0,
        profit: 0,
      },
    });
  });

  console.log('Deleted:');
  for (const [table, n] of Object.entries(counts)) {
    console.log(`  ${table}: ${n}`);
  }
  console.log('User stats reset to defaults (balance=100, betsCount=0, betsWon=0, roi=0, profit=0).');
  console.log('Reset complete.');
}

main()
  .catch((err) => fail((err as Error).message))
  .finally(() => prisma.$disconnect());
