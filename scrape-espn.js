const { chromium } = require('playwright');

const PAGE_URL = 'https://www.espn.com/soccer/stats/_/league/fifa.world';

async function scrapeEspn() {
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

  const tables = await page.$$eval('table.Table', (tables) =>
    tables.map((table) => {
      const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.innerText.trim());
      const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td')).map((td) => td.innerText.trim());
        return headers.reduce((acc, header, index) => {
          acc[header] = cells[index] ?? '';
          return acc;
        }, {});
      });
      return { headers, rows };
    })
  );

  console.log(JSON.stringify({ page: PAGE_URL, tables }, null, 2));

  await browser.close();
}

scrapeEspn().catch((error) => {
  console.error(error);
  process.exit(1);
});
