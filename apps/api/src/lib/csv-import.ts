/**
 * Pure CSV parsing + validation + status mapping for the Platinum League 1
 * import. No I/O, no Prisma — so the logic is unit-testable in isolation
 * (tests/import-matches.spec.ts).
 *
 * CSV format (UTF-8 with BOM, comma-separated), columns:
 *   etapa,data,ora,teren,gazda_id,gazda,oaspete_id,oaspete,goluri_gazda,goluri_oaspete,status
 *
 *   - data: YYYY-MM-DD (empty allowed only for AMANAT)
 *   - ora:  HH:mm (empty allowed only for AMANAT)
 *   - teren: unused
 *   - gazda_id/oaspete_id: Team.sourceTeamId
 *   - status: FINAL | MASA_VERDE | PROGRAMAT | AMANAT
 */

export const KNOWN_STATUSES = ['FINAL', 'MASA_VERDE', 'PROGRAMAT', 'AMANAT'] as const;
export type CsvStatus = (typeof KNOWN_STATUSES)[number];

export interface MatchStatusFields {
  status: 'FINISHED' | 'SCHEDULED' | 'POSTPONED';
  isForfeit: boolean;
  homeScore: number | null;
  awayScore: number | null;
}

/**
 * Maps a CSV status to the Match status + isForfeit + score fields.
 *   FINAL      -> FINISHED, isForfeit=false, scores from CSV
 *   MASA_VERDE -> FINISHED, isForfeit=true,  scores from CSV
 *   PROGRAMAT  -> SCHEDULED, isForfeit=false, scores null
 *   AMANAT     -> POSTPONED, isForfeit=false, scores null
 */
export function mapCsvStatus(status: CsvStatus, homeScore: number, awayScore: number): MatchStatusFields {
  switch (status) {
    case 'FINAL':
      return { status: 'FINISHED', isForfeit: false, homeScore, awayScore };
    case 'MASA_VERDE':
      return { status: 'FINISHED', isForfeit: true, homeScore, awayScore };
    case 'PROGRAMAT':
      return { status: 'SCHEDULED', isForfeit: false, homeScore: null, awayScore: null };
    case 'AMANAT':
      return { status: 'POSTPONED', isForfeit: false, homeScore: null, awayScore: null };
  }
}

export interface ParsedCsvRow {
  line: number;
  matchday: number;
  date: string | null; // YYYY-MM-DD or null (AMANAT)
  time: string | null; // HH:mm or null (AMANAT)
  homeSourceTeamId: number;
  awaySourceTeamId: number;
  homeScoreRaw: number | null;
  awayScoreRaw: number | null;
  status: CsvStatus;
}

// Validates shape AND range so e.g. 2026-13-99 is rejected, not just accepted.
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidDateStr(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12) return false;
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (d < 1 || d > daysInMonth[mo - 1]) return false;
  return true;
}

/**
 * Parses one CSV line (without the header) into a ParsedCsvRow.
 * Throws with a descriptive message if any field is malformed.
 * Scores are read as null when empty; presence/validity is checked later in
 * validateRows, where the status is known.
 */
/**
 * Strips a UTF-8 BOM if present. A BOM-prefixed file, if not stripped, would
 * make the first field of the header line start with the BOM and would fail
 * parseCsvRow on the first data row (etapa would parse as NaN -> error).
 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Parses full CSV text (BOM-tolerant) into ParsedCsvRow[] (header skipped).
 * This is the single entry point the import script should use; it keeps BOM
 * handling + line splitting in one place so it can be unit-tested.
 */
export function parseCsvFile(csvText: string): ParsedCsvRow[] {
  const text = stripBom(csvText);
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error('CSV file is empty');
  return lines.slice(1).map((line, i) => parseCsvRow(line, i + 2));
}

export function parseCsvRow(line: string, lineNo: number): ParsedCsvRow {
  const fields = line.split(',').map((f) => f.trim());
  if (fields.length !== 11) {
    throw new Error(`Line ${lineNo}: expected 11 fields, got ${fields.length}`);
  }
  const [etapa, data, ora, teren, gazdaId, gazda, oaspeteId, oaspete, goluriGazda, goluriOaspete, status] = fields;
  void teren;
  void gazda;
  void oaspete;

  const matchday = parseInt(etapa, 10);
  if (!Number.isInteger(matchday) || matchday < 1) {
    throw new Error(`Line ${lineNo}: etapa must be an integer >= 1, got "${etapa}"`);
  }

  if (data !== '' && !isValidDateStr(data)) {
    throw new Error(`Line ${lineNo}: data must be a valid YYYY-MM-DD or empty, got "${data}"`);
  }
  if (ora !== '' && !TIME_RE.test(ora)) {
    throw new Error(`Line ${lineNo}: ora must be HH:mm or empty, got "${ora}"`);
  }

  const homeSourceTeamId = parseInt(gazdaId, 10);
  if (!Number.isInteger(homeSourceTeamId)) {
    throw new Error(`Line ${lineNo}: gazda_id must be an integer, got "${gazdaId}"`);
  }
  const awaySourceTeamId = parseInt(oaspeteId, 10);
  if (!Number.isInteger(awaySourceTeamId)) {
    throw new Error(`Line ${lineNo}: oaspete_id must be an integer, got "${oaspeteId}"`);
  }

  const scoreToNumber = (raw: string, label: string): number | null => {
    if (raw === '') return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`Line ${lineNo}: ${label} must be an integer >= 0, got "${raw}"`);
    }
    return n;
  };

  const statusUpper = status.toUpperCase() as CsvStatus;
  if (!KNOWN_STATUSES.includes(statusUpper)) {
    throw new Error(`Line ${lineNo}: unknown status "${status}"`);
  }

  return {
    line: lineNo,
    matchday,
    date: data === '' ? null : data,
    time: ora === '' ? null : ora,
    homeSourceTeamId,
    awaySourceTeamId,
    homeScoreRaw: scoreToNumber(goluriGazda, 'goluri_gazda'),
    awayScoreRaw: scoreToNumber(goluriOaspete, 'goluri_oaspete'),
    status: statusUpper,
  };
}

/**
 * Validates a list of parsed rows:
 *   - etapa in 1..6
 *   - FINAL/MASA_VERDE: both scores present and integer >= 0
 *   - PROGRAMAT: scores absent
 *   - AMANAT: scores absent; date optional (defaulted at import time)
 *   - home team != away team
 * Throws listing ALL errors (does not stop at the first one).
 */
export function validateRows(rows: ParsedCsvRow[]): string[] {
  const errors: string[] = [];
  for (const row of rows) {
    if (row.matchday < 1 || row.matchday > 6) {
      errors.push(`Line ${row.line}: etapa must be in 1..6, got ${row.matchday}`);
    }
    if (row.homeSourceTeamId === row.awaySourceTeamId) {
      errors.push(`Line ${row.line}: home and away team must be different (both ${row.homeSourceTeamId})`);
    }
    const needsScores = row.status === 'FINAL' || row.status === 'MASA_VERDE';
    if (needsScores) {
      if (row.homeScoreRaw === null) errors.push(`Line ${row.line}: ${row.status} requires goluri_gazda`);
      if (row.awayScoreRaw === null) errors.push(`Line ${row.line}: ${row.status} requires goluri_oaspete`);
    } else {
      if (row.homeScoreRaw !== null || row.awayScoreRaw !== null) {
        errors.push(`Line ${row.line}: ${row.status} must not have scores`);
      }
    }
    if (row.status === 'AMANAT') {
      // date/time optional; nothing to require here
    } else {
      if (row.date === null) errors.push(`Line ${row.line}: ${row.status} requires a date`);
      if (row.time === null) errors.push(`Line ${row.line}: ${row.status} requires a time`);
    }
  }
  return errors;
}

/**
 * Builds the deterministic externalId: `pl1-e{etapa}-{slugGazda}-{slugOaspete}`.
 * Slugs come from team names so a re-run finds the same key and does not
 * create duplicates.
 */
export function buildExternalId(matchday: number, homeName: string, awayName: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '-');
  return `pl1-e${matchday}-${slug(homeName)}-${slug(awayName)}`;
}

/**
 * Groups rows by matchday and, for AMANAT rows whose date is null, picks the
 * earliest non-null date among the OTHER rows of the same matchday. Returns a
 * map of row index (in the input array) -> default date (YYYY-MM-DD).
 * If no other row in the same matchday has a date, returns null and the
 * import will fail with a clear error.
 */
export function defaultDatesForAmanat(rows: ParsedCsvRow[]): Map<number, string | null> {
  const byMatchday = new Map<number, ParsedCsvRow[]>();
  for (const row of rows) {
    if (!byMatchday.has(row.matchday)) byMatchday.set(row.matchday, []);
    byMatchday.get(row.matchday)!.push(row);
  }

  const result = new Map<number, string | null>();
  rows.forEach((row, idx) => {
    if (row.status !== 'AMANAT' || row.date !== null) return;
    const siblings = (byMatchday.get(row.matchday) ?? []).filter((r) => r.date !== null);
    if (siblings.length === 0) {
      result.set(idx, null);
      return;
    }
    const minDate = siblings.map((r) => r.date as string).sort()[0];
    result.set(idx, minDate);
  });
  return result;
}
