require('dotenv').config();

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ValidationError, ValidationChain } from 'express-validator';

const express = require('express');
const { query, param, body, validationResult } = require('express-validator');
const fs = require('fs');
const { chromium } = require('playwright');

type QueryResultRow = Record<string, unknown>;
type Queryable = {
  query: <T extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: readonly unknown[]
  ) => Promise<{ rows: T[] }>;
};

type StoreStatsFn = () => Promise<unknown>;

type CreateAppDeps = {
  pool?: Queryable;
  storeStats?: StoreStatsFn;
  allowedOrigins?: string[];
};

type PaginationInput = { limit: number; offset: number; total: number };
type PaginationMeta = PaginationInput & { hasMore: boolean };
type PlaywrightStatus = {
  installed: boolean;
  executablePath: string | null;
  error?: string;
};

function getDefaultPool(): Queryable {
  return require('./db').pool;
}

function getDefaultStoreStats(): StoreStatsFn {
  return require('./store-stats').storeStats;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'https://jmoten212.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

function getPlaywrightStatus(): PlaywrightStatus {
  try {
    const executablePath = chromium.executablePath();
    const installed = Boolean(executablePath) && fs.existsSync(executablePath);
    return { installed, executablePath };
  } catch (error: unknown) {
    return {
      installed: false,
      executablePath: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildPagination({ limit, offset, total }: PaginationInput): PaginationMeta {
  return {
    limit,
    offset,
    total,
    hasMore: offset + limit < total,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function handleValidationErrors(req: Request, res: Response, next: NextFunction): void | Response {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  return res.status(400).json({
    ok: false,
    error: 'Validation failed',
    details: errors.array().map((item: ValidationError) => ({
      field: 'path' in item ? item.path : '_error',
      message: item.msg,
      value: 'value' in item ? item.value : undefined,
    })),
  });
}

const paginationValidation: ValidationChain[] = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 500 })
    .withMessage('limit must be an integer between 1 and 500')
    .toInt(),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('offset must be an integer greater than or equal to 0')
    .toInt(),
];

const playersQueryValidation: Array<ValidationChain | RequestHandler> = [
  ...paginationValidation,
  query('search')
    .optional()
    .isString()
    .withMessage('search must be a string')
    .trim()
    .isLength({ max: 100 })
    .withMessage('search must be 100 characters or fewer'),
  handleValidationErrors,
];

const statsQueryValidation: Array<ValidationChain | RequestHandler> = [
  ...paginationValidation,
  query('player')
    .optional()
    .isString()
    .withMessage('player must be a string')
    .trim()
    .isLength({ max: 120 })
    .withMessage('player must be 120 characters or fewer'),
  query('team')
    .optional()
    .isString()
    .withMessage('team must be a string')
    .trim()
    .isLength({ max: 120 })
    .withMessage('team must be 120 characters or fewer'),
  handleValidationErrors,
];

const playerPathValidation: Array<ValidationChain | RequestHandler> = [
  param('player')
    .isString()
    .withMessage('player path parameter must be a string')
    .trim()
    .notEmpty()
    .withMessage('player path parameter cannot be empty')
    .isLength({ max: 120 })
    .withMessage('player path parameter must be 120 characters or fewer'),
  ...paginationValidation,
  handleValidationErrors,
];

const scrapeValidation: Array<ValidationChain | RequestHandler> = [
  body().custom((value: unknown) => {
    if (value && typeof value === 'object' && Object.keys(value).length > 0) {
      throw new Error('request body must be empty');
    }
    return true;
  }),
  handleValidationErrors,
];

function createApp(deps: CreateAppDeps = {}) {
  const dbPool = deps.pool || getDefaultPool();
  const runStoreStats = deps.storeStats;
  const allowedOrigins = deps.allowedOrigins || DEFAULT_ALLOWED_ORIGINS;

  function getCorsOrigin(origin: string | string[] | undefined): string | null {
    if (!origin) return '*';
    if (Array.isArray(origin)) return null;
    return allowedOrigins.includes(origin) ? origin : null;
  }

  function setCorsHeaders(res: Response, origin: string | null): void {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (origin) {
      headers['Access-Control-Allow-Origin'] = origin;
    }

    res.set(headers);
  }

  const app = express();
  app.use(express.json());

  app.use((req: Request, res: Response, next: NextFunction) => {
    const corsOrigin = getCorsOrigin(req.headers.origin);

    if (req.headers.origin && !corsOrigin) {
      res.status(403).json({ ok: false, error: 'CORS origin denied' });
      return;
    }

    if (req.method === 'OPTIONS') {
      setCorsHeaders(res, corsOrigin);
      res.status(204).end();
      return;
    }

    setCorsHeaders(res, corsOrigin);
    next();
  });

  app.get('/health', (_req: Request, res: Response) => {
    const playwrightStatus = getPlaywrightStatus();
    res.json({
      ok: true,
      service: 'scrape-server',
      playwright: {
        installed: playwrightStatus.installed,
        executablePath: playwrightStatus.executablePath,
      },
    });
  });

  app.get('/api/players', playersQueryValidation, async (req: Request, res: Response) => {
    try {
      const limit = parsePositiveInt(req.query.limit, 50);
      const offset = parsePositiveInt(req.query.offset, 0);
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

      const values: Array<string | number> = [limit, offset];
      let whereClause = "WHERE player IS NOT NULL AND player <> ''";

      if (search) {
        values.unshift(`%${search}%`);
        whereClause += ' AND player ILIKE $1';
      }

      const query = search
        ? `
          SELECT player, team, MAX(scraped_at) AS last_scraped, COUNT(*)::int AS stat_rows
          FROM espn_player_stats
          ${whereClause}
          GROUP BY player, team
          ORDER BY player ASC
          LIMIT $${values.length - 1} OFFSET $${values.length}
        `
        : `
          SELECT player, team, MAX(scraped_at) AS last_scraped, COUNT(*)::int AS stat_rows
          FROM espn_player_stats
          ${whereClause}
          GROUP BY player, team
          ORDER BY player ASC
          LIMIT $1 OFFSET $2
        `;

      const countQuery = search
        ? `
          SELECT COUNT(*)::int AS total
          FROM (
            SELECT player, team
            FROM espn_player_stats
            ${whereClause}
            GROUP BY player, team
          ) AS player_groups
        `
        : `
          SELECT COUNT(*)::int AS total
          FROM (
            SELECT player, team
            FROM espn_player_stats
            ${whereClause}
            GROUP BY player, team
          ) AS player_groups
        `;

      const { rows } = await dbPool.query(query, values);
      const countValues = search ? [`%${search}%`] : [];
      const countResult = await dbPool.query(countQuery, countValues);
      const total = parsePositiveInt(countResult.rows[0]?.total, 0);

      res.json({
        ok: true,
        data: rows,
        pagination: buildPagination({ limit, offset, total }),
      });
    } catch (error: unknown) {
      res.status(500).json({ ok: false, error: getErrorMessage(error) });
    }
  });

  app.get('/api/stats', statsQueryValidation, async (req: Request, res: Response) => {
    try {
      const limit = parsePositiveInt(req.query.limit, 100);
      const offset = parsePositiveInt(req.query.offset, 0);
      const player = typeof req.query.player === 'string' ? req.query.player.trim() : '';
      const team = typeof req.query.team === 'string' ? req.query.team.trim() : '';

      const filters: string[] = [];
      const values: Array<string | number> = [];

      if (player) {
        values.push(player);
        filters.push(`player ILIKE $${values.length}`);
      }

      if (team) {
        values.push(team);
        filters.push(`team ILIKE $${values.length}`);
      }

      values.push(limit);
      values.push(offset);

      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
      const countQuery = `
        SELECT COUNT(*)::int AS total
        FROM espn_player_stats
        ${whereClause}
      `;

      const { rows } = await dbPool.query(
        `
          SELECT id, scraped_at, source_key, player, team, goals, assists, raw
          FROM espn_player_stats
          ${whereClause}
          ORDER BY scraped_at DESC, id DESC
          LIMIT $${values.length - 1} OFFSET $${values.length}
        `,
        values
      );

      const countValues = values.slice(0, values.length - 2);
      const countResult = await dbPool.query(countQuery, countValues);
      const total = parsePositiveInt(countResult.rows[0]?.total, 0);

      res.json({
        ok: true,
        data: rows,
        pagination: buildPagination({ limit, offset, total }),
      });
    } catch (error: unknown) {
      res.status(500).json({ ok: false, error: getErrorMessage(error) });
    }
  });

  async function getPlayerDetail(req: Request, res: Response): Promise<void> {
    try {
      const player = decodeURIComponent(req.params.player).trim();
      const limit = parsePositiveInt(req.query.limit, 100);
      const offset = parsePositiveInt(req.query.offset, 0);

      const summaryResult = await dbPool.query(
        `
          SELECT
            player,
            team,
            COUNT(*)::int AS stat_rows,
            MAX(scraped_at) AS last_scraped,
            SUM(COALESCE(goals, 0))::int AS total_goals,
            SUM(COALESCE(assists, 0))::int AS total_assists
          FROM espn_player_stats
          WHERE player ILIKE $1
          GROUP BY player, team
          ORDER BY last_scraped DESC
          LIMIT 1
        `,
        [player]
      );

      const statsResult = await dbPool.query(
        `
          SELECT id, scraped_at, source_key, player, team, goals, assists, raw
          FROM espn_player_stats
          WHERE player ILIKE $1
          ORDER BY scraped_at DESC, id DESC
          LIMIT $2 OFFSET $3
        `,
        [player, limit, offset]
      );

      const summary = summaryResult.rows[0] || null;
      const total = summary ? parsePositiveInt(summary.stat_rows, 0) : 0;

      res.json({
        ok: true,
        data: {
          player: summary,
          stats: statsResult.rows,
        },
        pagination: buildPagination({ limit, offset, total }),
      });
    } catch (error: unknown) {
      res.status(500).json({ ok: false, error: getErrorMessage(error) });
    }
  }

  app.get('/api/players/:player', playerPathValidation, getPlayerDetail);
  app.get('/api/players/:player/stats', playerPathValidation, getPlayerDetail);

  app.post('/api/scrape-espn', scrapeValidation, async (_req: Request, res: Response) => {
    const playwrightStatus = getPlaywrightStatus();
    if (!playwrightStatus.installed) {
      res.status(503).json({
        ok: false,
        error: 'Playwright Chromium is not installed on this server. Run `npx playwright install chromium` during build.',
        executablePath: playwrightStatus.executablePath,
        details: playwrightStatus.error || null,
      });
      return;
    }

    try {
      const storeStatsFn = runStoreStats || getDefaultStoreStats();
      const result = await storeStatsFn();
      res.json({ ok: true, result });
    } catch (error: unknown) {
      res.status(500).json({ ok: false, error: getErrorMessage(error) });
    }
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ ok: false, error: 'Not found' });
  });

  return app;
}

module.exports = {
  createApp,
  DEFAULT_ALLOWED_ORIGINS,
};
