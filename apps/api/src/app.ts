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
    values?: readonly unknown[],
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
      error: getErrorMessage(error),
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

function redactLogMessage(message: string): string {
  const databaseUrl = process.env.DATABASE_URL;
  let redacted = databaseUrl ? message.split(databaseUrl).join('[redacted database URL]') : message;
  redacted = redacted.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[redacted database URL]');

  if (databaseUrl) {
    try {
      const password = new URL(databaseUrl).password;
      if (password) {
        redacted = redacted.split(password).join('[redacted]');
        redacted = redacted.split(decodeURIComponent(password)).join('[redacted]');
      }
    } catch {
      return '[unable to safely log error: invalid database URL or password encoding]';
    }
  }

  return redacted;
}

function errorLogDetails(error: unknown, depth = 0): Record<string, unknown> {
  if (depth >= 5) return { message: '[maximum error depth reached]' };
  if (!(error instanceof Error)) return { message: redactLogMessage(String(error)) };

  const details: Record<string, unknown> = {
    name: redactLogMessage(error.name),
    message: redactLogMessage(error.message),
  };
  const code = (error as Error & { code?: string }).code;
  if (code) details.code = redactLogMessage(code);
  if (error.cause !== undefined) details.cause = errorLogDetails(error.cause, depth + 1);
  if (error instanceof AggregateError) {
    details.errors = error.errors.map((nestedError: unknown) =>
      errorLogDetails(nestedError, depth + 1),
    );
  }
  return details;
}

function logServerError(route: string, error: unknown): void {
  console.error(JSON.stringify({ route, error: errorLogDetails(error) }));
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

type Validation = Array<ValidationChain | RequestHandler>;

function optionalTrimmedString(field: string, max: number): ValidationChain {
  return query(field)
    .optional()
    .isString()
    .withMessage(`${field} must be a string`)
    .trim()
    .isLength({ max })
    .withMessage(`${field} must be ${max} characters or fewer`);
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

const playersQueryValidation: Validation = [
  ...paginationValidation,
  optionalTrimmedString('search', 100),
  handleValidationErrors,
];

const statsQueryValidation: Validation = [
  ...paginationValidation,
  optionalTrimmedString('player', 120),
  optionalTrimmedString('team', 120),
  handleValidationErrors,
];

const playerPathValidation: Validation = [
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

const scrapeValidation: Validation = [
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

    setCorsHeaders(res, corsOrigin);

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

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

      const filterValues: string[] = [];
      let whereClause = "WHERE player IS NOT NULL AND player <> ''";

      if (search) {
        filterValues.push(`%${search}%`);
        whereClause += ` AND player ILIKE $${filterValues.length}`;
      }

      const values = [...filterValues, limit, offset];

      const { rows } = await dbPool.query(
        `
          SELECT player, team, MAX(scraped_at) AS last_scraped, COUNT(*)::int AS stat_rows
          FROM espn_player_stats
          ${whereClause}
          GROUP BY player, team
          ORDER BY player ASC
          LIMIT $${values.length - 1} OFFSET $${values.length}
        `,
        values,
      );

      const countResult = await dbPool.query(
        `
          SELECT COUNT(*)::int AS total
          FROM (
            SELECT player, team
            FROM espn_player_stats
            ${whereClause}
            GROUP BY player, team
          ) AS player_groups
        `,
        filterValues,
      );
      const total = parsePositiveInt(countResult.rows[0]?.total, 0);

      res.json({
        ok: true,
        data: rows,
        pagination: buildPagination({ limit, offset, total }),
      });
    } catch (error: unknown) {
      logServerError('GET /api/players', error);
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
      const filterValues: string[] = [];

      if (player) {
        filterValues.push(player);
        filters.push(`player ILIKE $${filterValues.length}`);
      }

      if (team) {
        filterValues.push(team);
        filters.push(`team ILIKE $${filterValues.length}`);
      }

      const values = [...filterValues, limit, offset];
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

      const { rows } = await dbPool.query(
        `
          SELECT id, scraped_at, source_key, player, team, goals, assists, raw
          FROM espn_player_stats
          ${whereClause}
          ORDER BY goals DESC NULLS LAST, assists DESC NULLS LAST
          LIMIT $${values.length - 1} OFFSET $${values.length}
        `,
        values,
      );

      const countResult = await dbPool.query(
        `
          SELECT COUNT(*)::int AS total
          FROM espn_player_stats
          ${whereClause}
        `,
        filterValues,
      );
      const total = parsePositiveInt(countResult.rows[0]?.total, 0);

      res.json({
        ok: true,
        data: rows,
        pagination: buildPagination({ limit, offset, total }),
      });
    } catch (error: unknown) {
      logServerError('GET /api/stats', error);
      res.status(500).json({ ok: false, error: getErrorMessage(error) });
    }
  });

  async function getPlayerDetail(req: Request, res: Response): Promise<void> {
    try {
      // Express has already decoded the param; playerPathValidation guarantees it is non-empty
      const player = String(req.params.player).trim();

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
        [player],
      );

      const statsResult = await dbPool.query(
        `
          SELECT id, scraped_at, source_key, player, team, goals, assists, raw
          FROM espn_player_stats
          WHERE player ILIKE $1
          ORDER BY goals DESC NULLS LAST, assists DESC NULLS LAST
          LIMIT $2 OFFSET $3
        `,
        [player, limit, offset],
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
      logServerError('GET /api/players/:player', error);
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
        error:
          'Playwright Chromium is not installed on this server. Run `npx playwright install chromium` during build.',
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
      logServerError('POST /api/scrape-espn', error);
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
