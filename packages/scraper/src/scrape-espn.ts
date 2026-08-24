const { chromium } = require('playwright');

const PAGE_URL = 'https://www.espn.com/soccer/stats/_/league/fifa.world';

type ESPNRow = Record<string, string>;
type ESPNTable = { headers: string[]; rows: ESPNRow[] };
type ScrapeEspnResult = { page: string; tables: ESPNTable[] };

async function scrapeEspn(): Promise<ScrapeEspnResult> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  console.log('Navigating to ESPN stats page...');
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('table.Table tbody tr', { timeout: 120000 });
  await page.waitForTimeout(3000);

  const tables: ESPNTable[] = await page.$$eval('table.Table', (tables: Element[]): ESPNTable[] =>
    tables.map((table: Element): ESPNTable => {
      const headerCells = Array.from(table.querySelectorAll('thead th')) as HTMLElement[];
      const headers = headerCells.map((th: HTMLElement) => th.innerText.trim());
      const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr: Element) => {
        const cells = Array.from(tr.querySelectorAll('td')) as HTMLElement[];
        return headers.reduce((acc: ESPNRow, header: string, index: number): ESPNRow => {
          acc[header] = cells[index]?.innerText.trim() ?? '';
          return acc;
        }, {});
      });
      return { headers, rows };
    })
  );

  const result = { page: PAGE_URL, tables };

  await browser.close();

  return result;
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
