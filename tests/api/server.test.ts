import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import type { Express } from 'express';
import * as appModule from '../../apps/api/src/app';

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
  DEFAULT_ALLOWED_ORIGINS: string[];
};

const { createApp, DEFAULT_ALLOWED_ORIGINS } = appModule as {
  createApp: AppModuleShape['createApp'];
  DEFAULT_ALLOWED_ORIGINS: AppModuleShape['DEFAULT_ALLOWED_ORIGINS'];
};

function createFakePool(): Queryable {
  return {
    query: async (sql: string, values: readonly unknown[] = []) => {
      const queryText = String(sql);

      if (queryText.includes('COUNT(*)::int AS total')) {
        return { rows: [{ total: 0 }] };
      }

      if (queryText.includes('FROM espn_player_stats')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected query in test: ${queryText} :: ${JSON.stringify(values)}`);
    },
  };
}

describe('API server', () => {
  let app: Express;

  beforeEach(() => {
    app = createApp({
      pool: createFakePool(),
      storeStats: async () => ({ rowsScraped: 1, rowsUpserted: 1, table: 'espn_player_stats' }),
      allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
    });
  });

  it('returns health status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.service).toBe('scrape-server');
  });

  it('allows preflight from preview origin', async () => {
    const response = await request(app)
      .options('/api/scrape-espn')
      .set('Origin', 'http://localhost:4173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:4173');
  });

  it('denies preflight from unknown origin', async () => {
    const response = await request(app)
      .options('/api/scrape-espn')
      .set('Origin', 'http://malicious.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ ok: false, error: 'CORS origin denied' });
  });

  it('returns validation errors for invalid limit', async () => {
    const response = await request(app)
      .get('/api/players?limit=0');

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe('Validation failed');
    expect(Array.isArray(response.body.details)).toBe(true);
  });

  it('returns success for POST /api/scrape-espn when storeStats succeeds', async () => {
    const mockStoreStats = async () => ({ rowsScraped: 3, rowsUpserted: 3, table: 'espn_player_stats' });
    const successApp = createApp({
      pool: createFakePool(),
      storeStats: mockStoreStats,
      allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
    });

    const response = await request(successApp)
      .post('/api/scrape-espn')
      .set('Origin', 'http://localhost:4173');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.result).toEqual({ rowsScraped: 3, rowsUpserted: 3, table: 'espn_player_stats' });
  });

  it('returns failure for POST /api/scrape-espn when storeStats throws', async () => {
    const mockStoreStats = async () => {
      throw new Error('scrape failed');
    };
    const failureApp = createApp({
      pool: createFakePool(),
      storeStats: mockStoreStats,
      allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
    });

    const response = await request(failureApp)
      .post('/api/scrape-espn')
      .set('Origin', 'http://localhost:4173');

    expect(response.status).toBe(500);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe('scrape failed');
  });

  it('returns 404 JSON for unknown routes', async () => {
    const response = await request(app).get('/nope');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ ok: false, error: 'Not found' });
  });
});
