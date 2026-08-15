import dotenv from 'dotenv';
import request from 'supertest';
import { Pool } from 'pg';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as appModule from '../../app';

dotenv.config({ path: '.env.test' });

type QueryResultRow = Record<string, unknown>;
type Queryable = {
  query: (sql: string, values?: readonly unknown[]) => Promise<{ rows: QueryResultRow[] }>;
};

type StoreStatsResult = {
  rowsScraped: number;
  rowsUpserted: number;
  table: string;
};

type CreateAppDeps = {
  pool?: Queryable;
  storeStats?: () => Promise<StoreStatsResult>;
  allowedOrigins?: string[];
};

type AppModuleShape = {
  createApp: (deps?: CreateAppDeps) => Express;
};

type SeedRow = {
  source_key: string;
  scraped_at: string;
  rank: string;
  player: string;
  team: string;
  goals: number;
  assists: number;
  raw: Record<string, string | number>;
};

const { createApp } = appModule as AppModuleShape;

const databaseUrl = process.env.DATABASE_URL_TEST || process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL_TEST is required for integration tests');
}

const pool = new Pool({ connectionString: databaseUrl });
const app = createApp({ pool });

const seedRows: SeedRow[] = [
  {
    source_key: 'alpha-player|team-a',
    scraped_at: '2026-08-01T10:00:00.000Z',
    rank: '1',
    player: 'Alpha Player',
    team: 'Team A',
    goals: 4,
    assists: 2,
    raw: { source: 'integration-test', player: 'Alpha Player' },
  },
  {
    source_key: 'lionel-messi|argentina-1',
    scraped_at: '2026-08-02T10:00:00.000Z',
    rank: '2',
    player: 'Lionel Messi',
    team: 'Argentina',
    goals: 10,
    assists: 3,
    raw: { source: 'integration-test', player: 'Lionel Messi', row: 1 },
  },
  {
    source_key: 'lionel-messi|argentina-2',
    scraped_at: '2026-08-03T10:00:00.000Z',
    rank: '2',
    player: 'Lionel Messi',
    team: 'Argentina',
    goals: 11,
    assists: 4,
    raw: { source: 'integration-test', player: 'Lionel Messi', row: 2 },
  },
];

async function createSchema(): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS espn_player_stats');
  await pool.query(`
    CREATE TABLE espn_player_stats (
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

  await pool.query('CREATE UNIQUE INDEX espn_player_stats_source_key_uniq ON espn_player_stats (source_key)');
}

async function seedData(): Promise<void> {
  for (const row of seedRows) {
    await pool.query(
      `
        INSERT INTO espn_player_stats (
          source_key,
          scraped_at,
          rank,
          player,
          team,
          goals,
          assists,
          raw
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        row.source_key,
        row.scraped_at,
        row.rank,
        row.player,
        row.team,
        row.goals,
        row.assists,
        row.raw,
      ]
    );
  }
}

beforeAll(async () => {
  await createSchema();
});

beforeEach(async () => {
  await pool.query('TRUNCATE TABLE espn_player_stats RESTART IDENTITY');
  await seedData();
});

afterAll(async () => {
  await pool.query('DROP TABLE IF EXISTS espn_player_stats');
  await pool.end();
});

describe('DB-backed API routes', () => {
  it('returns paginated player summaries from the database', async () => {
    const response = await request(app).get('/api/players?limit=1&offset=0');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.pagination).toMatchObject({
      limit: 1,
      offset: 0,
      total: 2,
      hasMore: true,
    });
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      player: 'Alpha Player',
      team: 'Team A',
      stat_rows: 1,
    });
  });

  it('returns a player summary and stats rows from the database', async () => {
    const response = await request(app).get('/api/players/Lionel%20Messi');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.pagination).toMatchObject({
      limit: 100,
      offset: 0,
      total: 2,
      hasMore: false,
    });
    expect(response.body.data.player).toMatchObject({
      player: 'Lionel Messi',
      team: 'Argentina',
      stat_rows: 2,
      total_goals: 21,
      total_assists: 7,
    });
    expect(response.body.data.stats).toHaveLength(2);
    expect(response.body.data.stats[0]).toMatchObject({
      player: 'Lionel Messi',
      team: 'Argentina',
      goals: 11,
      assists: 4,
    });
  });

  it('returns the alias detail route from the same database rows', async () => {
    const response = await request(app).get('/api/players/Lionel%20Messi/stats?offset=1&limit=1');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.pagination).toMatchObject({
      limit: 1,
      offset: 1,
      total: 2,
      hasMore: false,
    });
    expect(response.body.data.player).toMatchObject({
      player: 'Lionel Messi',
      team: 'Argentina',
      stat_rows: 2,
    });
    expect(response.body.data.stats).toHaveLength(1);
    expect(response.body.data.stats[0]).toMatchObject({
      player: 'Lionel Messi',
      team: 'Argentina',
      goals: 10,
      assists: 3,
    });
  });
});