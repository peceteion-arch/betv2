/**
 * Removes data left behind by tests/e2e-settlement.ts.
 *
 *   npx tsx scripts/cleanup-test-data.ts                      -> dry run (default, changes nothing)
 *   npx tsx scripts/cleanup-test-data.ts --apply \
 *       --confirm-db=<db name> --expect-users=<n> --expect-matches=<m>
 *
 * Safety model:
 *  - Dry run by default.
 *  - Only rows matching the strict criteria in testDataCriteria.ts, selected BY ID.
 *    There is no unfiltered deleteMany anywhere in this file.
 *  - --apply needs the exact database name AND the exact user/match counts the
 *    dry run printed. If anything changed in between, it refuses.
 *  - Refuses if any non-test user has a bet on a test match (stake must be
 *    refunded by hand first).
 *  - Everything runs in one transaction; any failed check rolls it all back.
 */
import { PrismaClient } from '@prisma/client';
import { parseDatabaseUrl } from '../tests/helpers/assertTestDatabase';
import { isTestUserEmail, isTestMatch } from './testDataCriteria';

const prisma = new PrismaClient();

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main() {
  const apply = process.argv.includes('--apply');

  const parsed = parseDatabaseUrl(process.env.DATABASE_URL);
  if (!parsed) {
    console.error('DATABASE_URL is missing or invalid.');
    process.exit(1);
  }
  console.log(`Database: ${parsed.dbName}`);
  console.log(`Host:     ${parsed.host}`);
  console.log(apply ? 'Mode:     APPLY\n' : 'Mode:     DRY RUN (nothing will be changed)\n');

  // ---- Select test data (strict criteria, re-checked in code) ----
  const users = (
    await prisma.user.findMany({
      where: { email: { endsWith: '@t.com', mode: 'insensitive' } },
      select: { id: true, name: true, email: true },
    })
  ).filter((u) => isTestUserEmail(u.email));

  const matches = (
    await prisma.match.findMany({
      where: {
        league: 'L',
        OR: [
          { externalId: { startsWith: 't-' } },
          { externalId: { startsWith: 'f-' } },
          { externalId: { startsWith: 'r-' } },
        ],
      },
      select: { id: true, homeTeam: true, awayTeam: true, league: true, externalId: true, status: true, matchDate: true },
    })
  ).filter(isTestMatch);

  const userIds = users.map((u) => u.id);
  const matchIds = matches.map((m) => m.id);

  console.log(`Test users:   ${users.length}`);
  for (const u of users) console.log(`  - ${u.id}  ${u.name}  ${u.email}`);
  console.log(`Test matches: ${matches.length}`);
  for (const m of matches) {
    console.log(`  - ${m.id}  ${m.homeTeam} vs ${m.awayTeam}  ${m.status}  ${m.matchDate.toISOString()}  ${m.externalId}`);
  }

  // ---- Bets involved ----
  const betsOfTestUsers = await prisma.bet.count({ where: { userId: { in: userIds } } });
  const foreignBets = await prisma.bet.findMany({
    where: {
      userId: { notIn: userIds },
      selections: { some: { matchId: { in: matchIds } } },
    },
    select: { id: true, userId: true, stake: true, status: true, user: { select: { email: true } } },
  });
  const notifications = await prisma.notification.count({ where: { userId: { in: userIds } } });

  console.log(`\nBets by test users (will be deleted): ${betsOfTestUsers}`);
  console.log(`Notifications of test users (cascade): ${notifications}`);

  if (foreignBets.length > 0) {
    console.error('\nSAFETY CHECK FAILED: real users have bets on test matches.');
    console.error('Refund these stakes manually, then run again. Nothing was deleted.');
    for (const b of foreignBets) {
      console.error(`  - bet ${b.id}  user ${b.user.email}  stake ${b.stake}  status ${b.status}`);
    }
    process.exit(1);
  }

  if (users.length === 0 && matches.length === 0) {
    console.log('\nNothing to clean up.');
    return;
  }

  if (!apply) {
    console.log('\nDry run complete. To delete exactly the rows listed above, run:');
    console.log(
      `  npx tsx scripts/cleanup-test-data.ts --apply --confirm-db=${parsed.dbName} ` +
        `--expect-users=${users.length} --expect-matches=${matches.length}`
    );
    return;
  }

  // ---- Apply: all confirmations must match ----
  const confirmDb = flag('confirm-db');
  const expectUsers = flag('expect-users');
  const expectMatches = flag('expect-matches');

  if (confirmDb !== parsed.dbName) {
    console.error(`\nRefused: --confirm-db must equal "${parsed.dbName}".`);
    process.exit(1);
  }
  if (expectUsers !== String(users.length) || expectMatches !== String(matches.length)) {
    console.error(
      `\nRefused: --expect-users/--expect-matches must equal the dry-run counts ` +
        `(${users.length} users, ${matches.length} matches). Run the dry run again.`
    );
    process.exit(1);
  }

  await prisma.$transaction(
    async (tx) => {
      // Bets first: BetSelection cascades from Bet, but Bet -> User and
      // BetSelection -> Match do not cascade.
      const bets = await tx.bet.deleteMany({ where: { userId: { in: userIds } } });
      console.log(`Deleted bets:    ${bets.count}`);

      const leftover = await tx.betSelection.count({ where: { matchId: { in: matchIds } } });
      if (leftover !== 0) {
        throw new Error(`${leftover} selections still reference test matches; rolling back.`);
      }

      const delMatches = await tx.match.deleteMany({ where: { id: { in: matchIds } } });
      console.log(`Deleted matches: ${delMatches.count}`);

      const delUsers = await tx.user.deleteMany({ where: { id: { in: userIds } } });
      console.log(`Deleted users:   ${delUsers.count}`);

      if (delMatches.count !== matches.length || delUsers.count !== users.length) {
        throw new Error('Deleted row counts differ from the selection; rolling back.');
      }
    },
    { timeout: 60_000 }
  );

  console.log('\nCleanup completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
