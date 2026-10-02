/**
 * Pure check: is this database name clearly a throwaway test database?
 * Matches names where "test" is its own underscore-delimited word:
 *   betleague_test, test_betleague, BETLEAGUE_TEST, my_test_db
 * Does NOT match: betleague, postgres, contest_db, latest, betleague_testing
 */
export function isTestDatabaseName(name: string): boolean {
  return /(^|_)test(_|$)/i.test(name);
}

/**
 * Parses a DATABASE_URL into the parts that are safe to print (never the
 * user or password). Returns null when the URL cannot be parsed or has no
 * database name.
 */
export function parseDatabaseUrl(
  dbUrl: string | undefined
): { dbName: string; host: string } | null {
  if (!dbUrl) return null;
  try {
    const url = new URL(dbUrl);
    const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (!dbName) return null;
    return { dbName, host: `${url.hostname}${url.port ? ':' + url.port : ''}` };
  } catch {
    return null;
  }
}

/**
 * Exits the process unless DATABASE_URL points at a test database.
 * Intentionally has no bypass. Must be called BEFORE anything connects to the DB.
 */
export function assertTestDatabase(): void {
  const parsed = parseDatabaseUrl(process.env.DATABASE_URL);
  if (!parsed) {
    console.error('Refused: DATABASE_URL is missing, invalid or has no database name.');
    console.error('The e2e tests only run on a throwaway database. Example (PowerShell):');
    console.error('  $env:DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/betleague_test"');
    process.exit(1);
  }
  if (!isTestDatabaseName(parsed.dbName)) {
    console.error(
      `Refused: database '${parsed.dbName}' on '${parsed.host}' is not a test database.`
    );
    console.error('Its name must contain "test" as a separate word, e.g. betleague_test.');
    process.exit(1);
  }
}
