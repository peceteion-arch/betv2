import { describe, it, expect } from 'vitest';
import {
  parseCsvRow,
  parseCsvFile,
  stripBom,
  validateRows,
  mapCsvStatus,
  buildExternalId,
  defaultDatesForAmanat,
  ParsedCsvRow,
} from '../src/lib/csv-import';

describe('parseCsvRow', () => {
  it('parses a well-formed FINAL row', () => {
    const row = parseCsvRow('1,2026-09-13,20:10,T1,15,Partizan,8,Inter Galactic,2,4,FINAL', 2);
    expect(row).toEqual({
      line: 2,
      matchday: 1,
      date: '2026-09-13',
      time: '20:10',
      homeSourceTeamId: 15,
      awaySourceTeamId: 8,
      homeScoreRaw: 2,
      awayScoreRaw: 4,
      status: 'FINAL',
    });
  });

  it('parses a PROGRAMAT row with empty scores', () => {
    const row = parseCsvRow('6,2026-10-17,18:30,T1,3,Phoenix,5,Amicis Aventin Braila,,,PROGRAMAT', 37);
    expect(row.homeScoreRaw).toBeNull();
    expect(row.awayScoreRaw).toBeNull();
    expect(row.status).toBe('PROGRAMAT');
  });

  it('parses an AMANAT row with no date or time', () => {
    const row = parseCsvRow('5,,,T1,14,Ajax Dulcisimo,16,Damen Rapid,,,AMANAT', 30);
    expect(row.date).toBeNull();
    expect(row.time).toBeNull();
    expect(row.status).toBe('AMANAT');
  });

  it('rejects a line with the wrong field count', () => {
    expect(() => parseCsvRow('1,2026-09-13,T1', 2)).toThrow(/expected 11 fields/);
  });

  it('rejects a malformed date', () => {
    expect(() => parseCsvRow('1,2026-13-99,20:10,T1,15,x,8,y,2,4,FINAL', 2)).toThrow(/data must be a valid YYYY-MM-DD/);
  });

  it('rejects a malformed time', () => {
    expect(() => parseCsvRow('1,2026-09-13,25:99,T1,15,x,8,y,2,4,FINAL', 2)).toThrow(/ora must be HH:mm/);
  });

  it('rejects a negative score', () => {
    expect(() => parseCsvRow('1,2026-09-13,20:10,T1,15,x,8,y,-1,4,FINAL', 2)).toThrow(/goluri_gazda must be an integer >= 0/);
  });

  it('rejects an unknown status', () => {
    expect(() => parseCsvRow('1,2026-09-13,20:10,T1,15,x,8,y,2,4,BOGUS', 2)).toThrow(/unknown status/);
  });

  it('rejects a non-integer etapa', () => {
    expect(() => parseCsvRow('abc,2026-09-13,20:10,T1,15,x,8,y,2,4,FINAL', 2)).toThrow(/etapa must be an integer/);
  });

  it('case-normalises status to uppercase', () => {
    const row = parseCsvRow('1,2026-09-13,20:10,T1,15,x,8,y,2,4,final', 2);
    expect(row.status).toBe('FINAL');
  });
});

describe('validateRows', () => {
  const makeRow = (over: Partial<ParsedCsvRow>): ParsedCsvRow => ({
    line: 1,
    matchday: 1,
    date: '2026-09-13',
    time: '20:10',
    homeSourceTeamId: 15,
    awaySourceTeamId: 8,
    homeScoreRaw: 2,
    awayScoreRaw: 4,
    status: 'FINAL',
    ...over,
  });

  it('accepts a valid FINAL row', () => {
    expect(validateRows([makeRow({})])).toEqual([]);
  });

  it('rejects FINAL with missing scores', () => {
    const errors = validateRows([makeRow({ homeScoreRaw: null })]);
    expect(errors.some((e) => e.includes('requires goluri_gazda'))).toBe(true);
  });

  it('rejects PROGRAMAT with scores present', () => {
    const errors = validateRows([makeRow({ status: 'PROGRAMAT', homeScoreRaw: 1, awayScoreRaw: 1 })]);
    expect(errors.some((e) => e.includes('must not have scores'))).toBe(true);
  });

  it('rejects AMANAT missing scores but allowing no date', () => {
    const errors = validateRows([makeRow({ status: 'AMANAT', date: null, time: null, homeScoreRaw: null, awayScoreRaw: null })]);
    expect(errors).toEqual([]);
  });

  it('rejects PROGRAMAT with no date', () => {
    const errors = validateRows([makeRow({ status: 'PROGRAMAT', date: null, time: '20:00', homeScoreRaw: null, awayScoreRaw: null })]);
    expect(errors.some((e) => e.includes('requires a date'))).toBe(true);
  });

  it('rejects same home and away team', () => {
    const errors = validateRows([makeRow({ awaySourceTeamId: 15 })]);
    expect(errors.some((e) => e.includes('home and away team must be different'))).toBe(true);
  });

  it('rejects etapa outside 1..6', () => {
    const errors = validateRows([makeRow({ matchday: 7 })]);
    expect(errors.some((e) => e.includes('etapa must be in 1..6'))).toBe(true);
  });

  it('collects multiple errors at once', () => {
    const errors = validateRows([makeRow({ matchday: 9, awaySourceTeamId: 15 })]);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('mapCsvStatus', () => {
  it('maps FINAL to FINISHED with scores and isForfeit=false', () => {
    expect(mapCsvStatus('FINAL', 2, 4)).toEqual({ status: 'FINISHED', isForfeit: false, homeScore: 2, awayScore: 4 });
  });

  it('maps MASA_VERDE to FINISHED with isForfeit=true and CSV scores', () => {
    expect(mapCsvStatus('MASA_VERDE', 0, 6)).toEqual({ status: 'FINISHED', isForfeit: true, homeScore: 0, awayScore: 6 });
  });

  it('maps PROGRAMAT to SCHEDULED with null scores', () => {
    expect(mapCsvStatus('PROGRAMAT', 0, 0)).toEqual({ status: 'SCHEDULED', isForfeit: false, homeScore: null, awayScore: null });
  });

  it('maps AMANAT to POSTPONED with null scores', () => {
    expect(mapCsvStatus('AMANAT', 0, 0)).toEqual({ status: 'POSTPONED', isForfeit: false, homeScore: null, awayScore: null });
  });
});

describe('buildExternalId', () => {
  it('builds a deterministic slug-based id', () => {
    expect(buildExternalId(1, 'Partizan', 'Inter Galactic')).toBe('pl1-e1-partizan-inter-galactic');
  });

  it('normalises whitespace and case', () => {
    expect(buildExternalId(3, 'Ajax  Dulcisimo', 'DAMEN RAPID')).toBe('pl1-e3-ajax-dulcisimo-damen-rapid');
  });
});

describe('defaultDatesForAmanat', () => {
  const makeRow = (over: Partial<ParsedCsvRow>): ParsedCsvRow => ({
    line: 1,
    matchday: 5,
    date: '2026-10-10',
    time: '19:00',
    homeSourceTeamId: 1,
    awaySourceTeamId: 2,
    homeScoreRaw: null,
    awayScoreRaw: null,
    status: 'FINAL',
    ...over,
  });

  it('uses the earliest dated sibling for an AMANAT with no date', () => {
    const rows = [
      makeRow({ line: 1, status: 'FINAL', date: '2026-10-11' }),
      makeRow({ line: 2, status: 'FINAL', date: '2026-10-10' }),
      makeRow({ line: 3, status: 'AMANAT', date: null, time: null }),
    ];
    const result = defaultDatesForAmanat(rows);
    expect(result.get(2)).toBe('2026-10-10');
    expect(result.has(0)).toBe(false);
  });

  it('returns null when no sibling has a date', () => {
    const rows = [makeRow({ line: 1, status: 'AMANAT', date: null, time: null })];
    const result = defaultDatesForAmanat(rows);
    expect(result.get(0)).toBeNull();
  });

  it('does not default a date for a non-AMANAT row', () => {
    const rows = [makeRow({ line: 1, status: 'FINAL', date: '2026-10-10', homeScoreRaw: 1, awayScoreRaw: 2 })];
    const result = defaultDatesForAmanat(rows);
    expect(result.has(0)).toBe(false);
  });
});

describe('stripBom', () => {
  const BOM_CHAR = String.fromCharCode(0xfeff);

  it('removes a leading UTF-8 BOM', () => {
    expect(stripBom(BOM_CHAR + 'etapa,data')).toBe('etapa,data');
  });

  it('leaves text without a BOM untouched', () => {
    expect(stripBom('etapa,data')).toBe('etapa,data');
  });

  it('does not strip a BOM appearing after the first character', () => {
    expect(stripBom('x' + BOM_CHAR + 'etapa')).toBe('x' + BOM_CHAR + 'etapa');
  });
});

describe('parseCsvFile (BOM handling, end-to-end)', () => {
  const BOM = String.fromCharCode(0xfeff);
  const HEADER = 'etapa,data,ora,teren,gazda_id,gazda,oaspete_id,oaspete,goluri_gazda,goluri_oaspete,status';

  it('parses the first data row correctly when a BOM is present', () => {
    const text = BOM + HEADER + '\n1,2026-09-13,20:10,T1,15,Partizan,8,Inter Galactic,2,4,FINAL';
    const rows = parseCsvFile(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].matchday).toBe(1);
    expect(rows[0].homeSourceTeamId).toBe(15);
    expect(rows[0].status).toBe('FINAL');
  });

  it('parses the same content without a BOM', () => {
    const text = HEADER + '\n1,2026-09-13,20:10,T1,15,Partizan,8,Inter Galactic,2,4,FINAL';
    const rows = parseCsvFile(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('FINAL');
  });

  it('throws on empty CSV', () => {
    expect(() => parseCsvFile('')).toThrow(/CSV file is empty/);
  });

  it('skips the header even when a BOM is prepended', () => {
    // Without stripping, the first field would carry the BOM and the first
    // data row would fail etapa validation. Strip + parse keeps it clean.
    const text = BOM + HEADER + '\n2,2026-09-29,19:00,T1,9,x,10,y,2,1,FINAL';
    const rows = parseCsvFile(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].matchday).toBe(2);
  });
});
