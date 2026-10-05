/**
 * Imports teams from the legacy SQLite database `minifotbal.db` into `teams`.
 *
 *   npm run import:minifotbal
 *
 * Scope: ONLY the `echipe` table (id, nume_echipa). No leagues, no players,
 * no events.
 *
 * Safety model:
 *  - The SQLite file is opened { readonly: true, fileMustExist: true } and is
 *    never written to.
 *  - Idempotent by `sourceTeamId`: an existing team is never modified. Names
 *    and logoUrls are edited by hand in Admin, so a re-run must not clobber
 *    them. Only new teams are inserted.
 *  - A new team whose name is already taken is skipped and reported, never a
 *    crash.
 *  - The excluded team id (44, 'Test') is never imported.
 */
import 'dotenv/config';
import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';

const EXCLUDED_SOURCE_TEAM_ID = 44;

const prisma = new PrismaClient();

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const dbPath = process.env.MINIFOTBAL_DB_PATH?.trim();
  if (!dbPath) {
    fail(
      'MINIFOTBAL_DB_PATH is not set.\n' +
        'Add it to apps/api/.env, e.g. MINIFOTBAL_DB_PATH="E:\\path\\to\\minifotbal.db"',
    );
  }

  const sqlite = new Database(dbPath, { readonly: true, fileMustExist: true });

  let sourceTeams: { id: number; nume_echipa: string }[];
  try {
    sourceTeams = sqlite
      .prepare('SELECT id, nume_echipa FROM echipe WHERE id <> ? ORDER BY id')
      .all(EXCLUDED_SOURCE_TEAM_ID) as { id: number; nume_echipa: string }[];
  } finally {
    sqlite.close();
  }

  const existingSourceIds = new Set(
    (
      await prisma.team.findMany({
        where: { sourceTeamId: { not: null } },
        select: { sourceTeamId: true },
      })
    ).flatMap((t) => (t.sourceTeamId === null ? [] : [t.sourceTeamId])),
  );

  let created = 0;
  let skipped = 0;
  const reported: string[] = [];

  for (const source of sourceTeams) {
    if (existingSourceIds.has(source.id)) {
      skipped++;
      continue;
    }

    const name = source.nume_echipa.trim();
    const alreadyByName = await prisma.team.findUnique({ where: { name } });
    if (alreadyByName) {
      skipped++;
      reported.push(
        `sourceTeamId=${source.id} name="${name}": name already used by an existing team`,
      );
      continue;
    }

    try {
      await prisma.team.create({ data: { sourceTeamId: source.id, name } });
      existingSourceIds.add(source.id);
      created++;
    } catch (err) {
      // Unique-constraint races on `name` / `source_team_id` must not abort the run.
      skipped++;
      reported.push(
        `sourceTeamId=${source.id} name="${name}": ${(err as Error).message.split('\n')[0]}`,
      );
    }
  }

  console.log(`Source teams read (id <> ${EXCLUDED_SOURCE_TEAM_ID}): ${sourceTeams.length}`);
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Reported: ${reported.length}`);
  for (const line of reported) console.log(`  - ${line}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());