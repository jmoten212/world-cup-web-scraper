const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

const PORT = process.env.PORT || 3001;
const ROOT_DIR = path.resolve(__dirname);
const ALLOWED_ORIGINS = [
  'https://jmoten212.github.io',
  'http://localhost:5173',
  'http://localhost:3001',
];

// ensure Playwright is installed on startup
function ensurePlaywrightInstalled() {
  const chromeDir = path.join(
    process.env.HOME || '/root',
    '.cache/ms-playwright/chromium_headless_shell-1228'
  );

  if (fs.existsSync(chromeDir)) {
    console.log('✓ Playwright Chromium is installed');
    return;
  }

  console.log('Installing Playwright Chromium browsers...');
  try {
    execSync('npx playwright install chromium', {
      stdio: 'inherit',
      env: { ...process.env },
    });
    console.log('✓ Playwright Chromium installed successfully');
  } catch (error) {
    console.error('✗ Failed to install Playwright:', error.message);
    process.exit(1);
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
    sendJson(res, 200, { ok: true, service: 'scrape-server' });
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Scrape server listening on http://localhost:${PORT}`);
});
