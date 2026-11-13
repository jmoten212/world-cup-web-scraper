import type { ESPNRow, ESPNTable } from './types';

const { pool } = require('./db');
const { scrapeEspn } = require('./scrape-espn');

function toInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseInt(String(value).replace(/[^\d-]/g, ''), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function toNullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

async function ensureTable(client: import('pg').PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS espn_player_stats (
      id SERIAL PRIMARY KEY,
      scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_key TEXT,
      rank TEXT,
      player TEXT,
      team TEXT,
      goals INT,
      assists INT,
      raw JSONB NOT NULL
    )
  `);

  await client.query('ALTER TABLE espn_player_stats ADD COLUMN IF NOT EXISTS source_key TEXT');
  await client.query('ALTER TABLE espn_player_stats ADD COLUMN IF NOT EXISTS rank TEXT');
  await client.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS espn_player_stats_source_key_uniq ON espn_player_stats (source_key)',
  );
}

// mergeTables guarantees every row has a NAME and TEAM, so this key is always non-empty
function buildSourceKey(row: ESPNRow): string {
  return `${row.NAME.trim().toLowerCase()}|${row.TEAM.trim().toLowerCase()}`;
}

function playerKey(row: ESPNRow): string {
  const name = toNullableText(row.NAME);
  const team = toNullableText(row.TEAM);

  if (!name || !team) {
    throw new Error('A scraped row is missing its player name or team.');
  }

  return JSON.stringify([name.toLowerCase(), team.toLowerCase()]);
}

function indexByPlayer(rows: ESPNRow[], tableName: string): Map<string, ESPNRow> {
  const index = new Map<string, ESPNRow>();

  for (const row of rows) {
    const key = playerKey(row);

    if (index.has(key)) {
      throw new Error(`Duplicate player in ${tableName} table: ${key}`);
    }

    index.set(key, row);
  }

  return index;
}

function mergeTables(tables: ESPNTable[]): ESPNRow[] {
  const [goalsTable, assistsTable] = Array.isArray(tables) ? tables : [];

  if (!goalsTable?.headers.includes('G') || !assistsTable?.headers.includes('A')) {
    throw new Error('Expected ESPN goals and assists tables.');
  }

  const players = indexByPlayer(goalsTable.rows, 'goals');

  for (const [key, assistsRow] of indexByPlayer(assistsTable.rows, 'assists')) {
    const existing = players.get(key);
    players.set(key, existing ? { ...existing, A: assistsRow.A } : assistsRow);
  }

  return Array.from(players.values());
}

async function storeStats(
  options: { closePool?: boolean } = {},
): Promise<{ rowsScraped: number; rowsUpserted: number; table: string; rows: ESPNRow[] }> {
  const { closePool = false } = options;
  const { tables }: { tables: ESPNTable[] } = await scrapeEspn();
  const mergedRows = mergeTables(tables);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureTable(client);

    for (const row of mergedRows) {
      const rank = toNullableText(row.RK || row.Rank || row.rank);
      const player = toNullableText(row.NAME);
      const team = toNullableText(row.TEAM);
      const goals = toInt(row.G);
      const assists = toInt(row.A);
      const sourceKey = buildSourceKey(row);

      await client.query(
        `
          INSERT INTO espn_player_stats (source_key, rank, player, team, goals, assists, raw)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (source_key)
          DO UPDATE SET
            rank = EXCLUDED.rank,
            player = EXCLUDED.player,
            team = EXCLUDED.team,
            goals = EXCLUDED.goals,
            assists = EXCLUDED.assists,
            raw = EXCLUDED.raw,
            scraped_at = NOW()
        `,
        [sourceKey, rank, player, team, goals, assists, row],
      );
    }

    await client.query('COMMIT');
    console.log(`Upserted ${mergedRows.length} rows into espn_player_stats.`);
    return {
      rowsScraped: mergedRows.length,
      rowsUpserted: mergedRows.length,
      table: 'espn_player_stats',
      rows: mergedRows,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    if (closePool) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  storeStats({ closePool: true })
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { storeStats, mergeTables };
