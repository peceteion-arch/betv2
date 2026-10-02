import { describe, it, expect } from 'vitest';
import { isTestDatabaseName, parseDatabaseUrl } from './assertTestDatabase';

describe('isTestDatabaseName', () => {
  it.each(['betleague_test', 'test_betleague', 'BETLEAGUE_TEST', 'my_test_db', 'test'])(
    'accepts %s',
    (name) => expect(isTestDatabaseName(name)).toBe(true)
  );

  it.each(['betleague', 'postgres', 'contest_db', 'latest', 'betleague_testing', '', 'protest'])(
    'rejects %s',
    (name) => expect(isTestDatabaseName(name)).toBe(false)
  );
});

describe('parseDatabaseUrl', () => {
  it('extracts database name and host without credentials', () => {
    const parsed = parseDatabaseUrl('postgresql://user:secretpass@localhost:5432/betleague_test?schema=public');
    expect(parsed).toEqual({ dbName: 'betleague_test', host: 'localhost:5432' });
    expect(JSON.stringify(parsed)).not.toContain('secretpass');
    expect(JSON.stringify(parsed)).not.toContain('user');
  });

  it('returns null for missing, invalid, or database-less URLs', () => {
    expect(parseDatabaseUrl(undefined)).toBeNull();
    expect(parseDatabaseUrl('')).toBeNull();
    expect(parseDatabaseUrl('not a url')).toBeNull();
    expect(parseDatabaseUrl('postgresql://user:pass@localhost:5432')).toBeNull();
  });
});
