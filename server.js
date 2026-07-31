require('dotenv').config();

const express = require('express');
const { query, param, body, validationResult } = require('express-validator');
const fs = require('fs');
const { chromium } = require('playwright');
const { pool } = require('./db');
const { storeStats } = require('./store-stats');

const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGINS = [
  'https://jmoten212.github.io',
  'http://localhost:5173',
  'http://localhost:3001',
];

const app = express();
app.use(express.json());

function getPlaywrightStatus() {
  try {
    const executablePath = chromium.executablePath();
    const installed = Boolean(executablePath) && fs.existsSync(executablePath);
    return { installed, executablePath };
  } catch (error) {
    return {
      installed: false,
      executablePath: null,
      error: error.message,
    };
  }
}

function getCorsOrigin(origin) {
  if (!origin) return '*';
  return ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

function setCorsHeaders(res, origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  res.set(headers);
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildPagination({ limit, offset, total }) {
  return {
    limit,
    offset,
    total,
    hasMore: offset + limit < total,
  };
}

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  return res.status(400).json({
    ok: false,
    error: 'Validation failed',
    details: errors.array().map((item) => ({
      field: item.path,
      message: item.msg,
      value: item.value,
    })),
  });
}

const paginationValidation = [
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

const playersQueryValidation = [
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

const statsQueryValidation = [
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

const playerPathValidation = [
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

const scrapeValidation = [
  body().custom((value) => {
    if (value && typeof value === 'object' && Object.keys(value).length > 0) {
      throw new Error('request body must be empty');
    }
    return true;
  }),
  handleValidationErrors,
];

app.use((req, res, next) => {
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
  req.corsOrigin = corsOrigin;
  next();
});

app.get('/health', (req, res) => {
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

app.get('/api/players', playersQueryValidation, async (req, res) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 50);
    const offset = parsePositiveInt(req.query.offset, 0);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const values = [limit, offset];
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

    const { rows } = await pool.query(query, values);
    const countValues = search ? [`%${search}%`] : [];
    const countResult = await pool.query(countQuery, countValues);
    const total = countResult.rows[0]?.total ?? 0;

    res.json({
      ok: true,
      data: rows,
      pagination: buildPagination({ limit, offset, total }),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/stats', statsQueryValidation, async (req, res) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 100);
    const offset = parsePositiveInt(req.query.offset, 0);
    const player = typeof req.query.player === 'string' ? req.query.player.trim() : '';
    const team = typeof req.query.team === 'string' ? req.query.team.trim() : '';

    const filters = [];
    const values = [];

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

    const { rows } = await pool.query(
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
    const countResult = await pool.query(countQuery, countValues);
    const total = countResult.rows[0]?.total ?? 0;

    res.json({
      ok: true,
      data: rows,
      pagination: buildPagination({ limit, offset, total }),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

async function getPlayerDetail(req, res) {
  try {
    const player = decodeURIComponent(req.params.player).trim();
    const limit = parsePositiveInt(req.query.limit, 100);
    const offset = parsePositiveInt(req.query.offset, 0);

    const summaryResult = await pool.query(
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

    const statsResult = await pool.query(
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
    const total = summary ? summary.stat_rows : 0;

    res.json({
      ok: true,
      data: {
        player: summary,
        stats: statsResult.rows,
      },
      pagination: buildPagination({ limit, offset, total }),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

app.get('/api/players/:player', playerPathValidation, getPlayerDetail);

app.get('/api/players/:player/stats', playerPathValidation, getPlayerDetail);

app.post('/api/scrape-espn', scrapeValidation, async (req, res) => {
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
    const result = await storeStats();
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Scrape server listening on http://localhost:${PORT}`);
});
