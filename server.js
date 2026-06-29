const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const PORT = process.env.PORT || 3001;
const ROOT_DIR = path.resolve(__dirname);
const ALLOWED_ORIGINS = [
  'https://jmoten212.github.io',
  'http://localhost:5173',
  'http://localhost:3001',
];

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

function sendJson(res, statusCode, payload, origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  const requestOrigin = req.headers.origin;
  const corsOrigin = getCorsOrigin(requestOrigin);

  if (req.method === 'OPTIONS') {
    if (!corsOrigin) {
      res.writeHead(403, {
        'Content-Type': 'text/plain',
      });
      res.end('CORS origin denied');
      return;
    }

    res.writeHead(204, {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.url === '/api/scrape-espn' && req.method === 'POST') {
    if (!corsOrigin) {
      sendJson(res, 403, { ok: false, error: 'CORS origin denied' }, '*');
      return;
    }

    const playwrightStatus = getPlaywrightStatus();
    if (!playwrightStatus.installed) {
      sendJson(
        res,
        503,
        {
          ok: false,
          error: 'Playwright Chromium is not installed on this server. Run `npx playwright install chromium` during build.',
          executablePath: playwrightStatus.executablePath,
          details: playwrightStatus.error || null,
        },
        corsOrigin
      );
      return;
    }

    const child = spawn('npm', ['run', 'scrape:espn'], {
      cwd: ROOT_DIR,
      shell: true,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      sendJson(res, 200, {
        ok: code === 0,
        exitCode: code,
        stdout,
        stderr,
      }, corsOrigin);
    });

    return;
  }

  if (req.url === '/health') {
    const playwrightStatus = getPlaywrightStatus();
    sendJson(res, 200, {
      ok: true,
      service: 'scrape-server',
      playwright: {
        installed: playwrightStatus.installed,
        executablePath: playwrightStatus.executablePath,
      },
    });
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Scrape server listening on http://localhost:${PORT}`);
});
