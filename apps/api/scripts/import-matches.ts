import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  ParsedCsvRow,
  parseCsvFile,
  validateRows,
  mapCsvStatus,
  buildExternalId,
  defaultDatesForAmanat,
} from '../src/lib/csv-import';
import { matchService } from '../src/services/match.service';

const prisma = new PrismaClient();

const COMPETITION_NAME = 'Platinum League 1';
const CSV_PATH = path.join(__dirname, 'data', 'platinum_league_1_meciuri.csv');

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/**
 * Interprets "YYYY-MM-DD" + "HH:mm" as Europe/Bucharest local time and returns
 * the corresponding UTC instant. Uses date-fns-tz (already a dependency and
 * used by match.service createManual) instead of a hardcoded offset.
 */
async function bucharestDate(date: string, time: string | null): Promise<Date> {
  const { fromZonedTime } = await import('date-fns-tz');
  const local = `${date}T${time ?? '12:00'}`;
  return fromZonedTime(local, 'Europe/Bucharest');
}

async function main(): Promise<void> {
  // ---- 1. Parse + validate CSV --------------------------------------------
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  let rows: ParsedCsvRow[];
  try {
    rows = parseCsvFile(raw);
  } catch (e) {
    fail(`Failed to parse CSV: ${(e as Error).message}`);
    return;
  }
  if (rows.length === 0) fail('CSV file has no data rows');
  const errors = validateRows(rows);
  if (errors.length > 0) {
    fail(`CSV validation failed:\n  ${errors.join('\n  ')}`);
  }
  console.log(`Parsed ${rows.length} rows. Validation OK.`);

  // ---- 2. Resolve teams by sourceTeamId ------------------------------------
  const sourceIds = [
    ...new Set([
      ...rows.map((r) => r.homeSourceTeamId),
      ...rows.map((r) => r.awaySourceTeamId),
    ]),
  ];
  const teams = await prisma.team.findMany({
    where: { sourceTeamId: { in: sourceIds } },
    select: { id: true, sourceTeamId: true, name: true },
  });
  const teamBySource = new Map<number, { id: string; name: string }>();
  for (const t of teams) {
    if (t.sourceTeamId !== null) teamBySource.set(t.sourceTeamId, { id: t.id, name: t.name });
  }
  const missing: string[] = [];
  for (const id of sourceIds) {
    if (!teamBySource.has(id)) missing.push(String(id));
  }
  if (missing.length > 0) {
    fail(`Missing teams (sourceTeamId not found in DB). Aborting. Missing ids:\n  ${missing.join('\n  ')}`);
  }

  // ---- 3. Resolve / create competition -------------------------------------
  let competition = await prisma.competition.findUnique({ where: { name: COMPETITION_NAME } });
  if (!competition) {
    competition = await prisma.competition.create({ data: { name: COMPETITION_NAME, active: true } });
    console.log(`Created competition "${COMPETITION_NAME}" (id=${competition.id}).`);
  } else {
    console.log(`Using existing competition "${COMPETITION_NAME}" (id=${competition.id}).`);
  }

  // ---- 4. Default dates for AMANAT rows ------------------------------------
  const amanatDates = defaultDatesForAmanat(rows);
  const warnings: string[] = [];

  // ---- 5. Execute import in one transaction --------------------------------
  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];
  const scheduledForOdds: string[] = []; // externalIds of newly-created SCHEDULED matches

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const home = teamBySource.get(row.homeSourceTeamId)!;
      const away = teamBySource.get(row.awaySourceTeamId)!;
      if (home.id === away.id) {
        fail(`Row ${row.line}: home and away resolve to the same team ${home.id}`);
      }
      const externalId = buildExternalId(row.matchday, home.name, away.name);

      const scores = mapCsvStatus(row.status, row.homeScoreRaw ?? 0, row.awayScoreRaw ?? 0);

      let dateStr = row.date;
      let timeStr = row.time;
      if (row.status === 'AMANAT' && dateStr === null) {
        dateStr = amanatDates.get(i) ?? null;
        timeStr = null;
        if (dateStr === null) {
          fail(`Row ${row.line}: AMANAT with no date and no other dated match in etapa ${row.matchday}`);
        }
        warnings.push(
          `Row ${row.line} (AMANAT, etapa ${row.matchday}): using default date ${dateStr} 12:00. Update from Admin when the real date is set.`,
        );
      }

      const matchDate = await bucharestDate(dateStr!, timeStr);

      const data = {
        externalId,
        homeTeamId: home.id,
        awayTeamId: away.id,
        competitionId: competition!.id,
        // `league` legacy column: match.service.createManual leaves it null when
        // a competitionId is given. We follow the same rule.
        league: null,
        matchday: row.matchday,
        matchDate,
        status: scores.status,
        isForfeit: scores.isForfeit,
        homeScore: scores.homeScore,
        awayScore: scores.awayScore,
      };

      const existing = await tx.match.findUnique({ where: { externalId: data.externalId } });
      if (existing) {
        skipped.push(externalId);
        // Bring the row up to date so re-runs stay consistent with the CSV.
        await tx.match.update({ where: { externalId: data.externalId }, data });
        updated.push(externalId);
      } else {
        await tx.match.create({ data });
        created.push(externalId);
        if (scores.status === 'SCHEDULED') scheduledForOdds.push(externalId);
      }
    }
  });

  // Odds for SCHEDULED matches use the same engine createManual() calls
  // (matchService.generateOdds), which writes via the global prisma client and
  // therefore cannot run inside the import transaction. We generate them for
  // the newly-created SCHEDULED matches only, after the transaction commits.
  // createManual's flow (generateOdds after match.create) is reproduced here
  // for the SCHEDULED subset; FINISHED/POSTPONED get no odds, as required.
  for (const externalId of scheduledForOdds) {
    const match = await prisma.match.findUnique({ where: { externalId } });
    if (match) {
      console.log(`Generating odds for SCHEDULED match ${externalId}...`);
      await matchService.generateOdds(match.id);
    }
  }

  // ---- 6. Summary by matchday ----------------------------------------------
  console.log('\n=== IMPORT SUMMARY (by matchday) ===');
  const byMatchday = new Map<number, { total: number; finished: number; forfeit: number; scheduled: number; postponed: number }>();
  for (const row of rows) {
    if (!byMatchday.has(row.matchday)) {
      byMatchday.set(row.matchday, { total: 0, finished: 0, forfeit: 0, scheduled: 0, postponed: 0 });
    }
    const bucket = byMatchday.get(row.matchday)!;
    bucket.total++;
    if (row.status === 'FINAL') bucket.finished++;
    if (row.status === 'MASA_VERDE') bucket.forfeit++;
    if (row.status === 'PROGRAMAT') bucket.scheduled++;
    if (row.status === 'AMANAT') bucket.postponed++;
  }
  console.log(
    `matchday | total | finished | forfeit | scheduled | postponed`,
  );
  let totalAll = 0;
  for (const [md, b] of [...byMatchday.entries()].sort((a, b2) => a[0] - b2[0])) {
    console.log(
      `  e${md}      | ${String(b.total).padStart(5)} | ${String(b.finished).padStart(8)} | ${String(b.forfeit).padStart(7)} | ${String(b.scheduled).padStart(9)} | ${String(b.postponed).padStart(9)}`,
    );
    totalAll += b.total;
  }
  console.log(`\nTotal matches imported: ${totalAll} (expected 42)`);

  console.log(`Created: ${created.length}`);
  console.log(`Updated: ${updated.length}`);
  console.log(`Skipped (already existed, refreshed): ${skipped.length}`);

  if (warnings.length > 0) {
    console.log('\nWARNINGS:');
    for (const w of warnings) console.log(`  ${w}`);
  }
}

main()
  .catch((err) => fail((err as Error).message))
  .finally(() => prisma.$disconnect());
