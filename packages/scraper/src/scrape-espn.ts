import type { ESPNTable } from './types';

const { chromium } = require('playwright');

const PAGE_URL = 'https://www.espn.com/soccer/stats/_/league/fifa.world';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const NAVIGATION_TIMEOUT_MS = 120_000;

type ScrapeEspnResult = { page: string; tables: ESPNTable[] };

async function scrapeEspn(): Promise<ScrapeEspnResult> {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ userAgent: USER_AGENT });

    console.log('Navigating to ESPN stats page...');
    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    await page.waitForSelector('table.Table tbody tr', { timeout: NAVIGATION_TIMEOUT_MS });
    await page.waitForTimeout(3000);

    const tables: ESPNTable[] = await page.$$eval('table.Table', (tables: Element[]) =>
      tables.map((table) => {
        const headers = Array.from(table.querySelectorAll<HTMLElement>('thead th'), (th) =>
          th.innerText.trim(),
        );
        const rows = Array.from(table.querySelectorAll('tbody tr'), (tr) => {
          const cells = tr.querySelectorAll<HTMLElement>('td');
          return Object.fromEntries(
            headers.map((header, index) => [header, cells[index]?.innerText.trim() ?? '']),
          );
        });
        return { headers, rows };
      }),
    );

    return { page: PAGE_URL, tables };
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeEspn };

if (require.main === module) {
  scrapeEspn()
    .then((data) => {
      console.log(JSON.stringify(data, null, 2));
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
