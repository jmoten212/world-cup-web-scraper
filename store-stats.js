const { pool } = require('./db');
const crypto = require('crypto');
const { scrapeEspn } = require('./scrape-espn');

function toInt(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Number.parseInt(String(value).replace(/[^\d-]/g, ''), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function toNullableText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

async function ensureTable(client) {
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
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS espn_player_stats_source_key_uniq ON espn_player_stats (source_key)');
}

function buildSourceKey(row, rowIndex) {
  const player = toNullableText(row.Name || row.NAME || row.Player || row.PLAYER || row.player) || '';
  const team = toNullableText(row.Team || row.TEAM || row.CLUB || row.Club || row.team) || '';
  const normalizedPlayer = player.toLowerCase();
  const normalizedTeam = team.toLowerCase();

  if (normalizedPlayer || normalizedTeam) {
    return `${normalizedPlayer}|${normalizedTeam}`;
  }

  const fallback = JSON.stringify(row);
  const digest = crypto.createHash('sha256').update(fallback).digest('hex').slice(0, 16);
  return `row-${rowIndex}-${digest}`;
}

function mergeTables(tables) {
  if (!Array.isArray(tables) || tables.length < 2) {
    throw new Error('Expected at least two ESPN tables (names and stats).');
  }

  const [namesTable, statsTable] = tables;
  return namesTable.rows.map((nameRow, index) => ({
    ...nameRow,
    ...(statsTable.rows[index] || {}),
  }));
}

async function storeStats(options = {}) {
  const { closePool = false } = options;
  const { tables } = await scrapeEspn();
  const mergedRows = mergeTables(tables);
  let upsertedCount = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureTable(client);

    for (const [index, row] of mergedRows.entries()) {
      const rank = toNullableText(row.RK || row.Rank || row.rank);
      const player = toNullableText(row.Name || row.NAME || row.Player || row.PLAYER || row.player);
      const team = toNullableText(row.Team || row.TEAM || row.CLUB || row.Club || row.team);
      const goals = toInt(row.G || row.Goals);
      const assists = toInt(row.A || row.Assists);
      const sourceKey = buildSourceKey(row, index);

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
        [sourceKey, rank, player, team, goals, assists, row]
      );

      upsertedCount += 1;
    }

    await client.query('COMMIT');
    const summary = {
      rowsScraped: mergedRows.length,
      rowsUpserted: upsertedCount,
      table: 'espn_player_stats',
    };
    console.log(`Upserted ${upsertedCount} rows into espn_player_stats.`);
    return summary;
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

module.exports = { storeStats };
