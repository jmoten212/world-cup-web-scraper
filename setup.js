#!/usr/bin/env node
/**
 * setup script to ensure Playwright browsers are installed
 * runs before the scraper starts
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function ensurePlaywrightInstalled() {
  const chromeDir = path.join(
    process.env.HOME || '/root',
    '.cache/ms-playwright/chromium_headless_shell-1228'
  );

  // check if Chromium is already installed
  if (fs.existsSync(chromeDir)) {
    console.log('✓ Playwright Chromium is already installed');
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

// run the setup
ensurePlaywrightInstalled().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});
