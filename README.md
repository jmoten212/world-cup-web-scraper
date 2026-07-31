<h1>World Cup Web Scraper</h1>

Created a web scraper with Playwright that uses React in the frontend and a Node server in the backend to scrape the stats for the leading scorers and assisters at the 2026 FIFA World Cup. It scrapes the data from the tables found at https://www.espn.com/soccer/stats/_/league/fifa.world and uses the backend server running at https://world-cup-web-scraper-1.onrender.com for the live production version of the app. I also created a RESTful API to go along with it that takes the scraped data, stores it in PostgreSQL and can be fetched using a few different <code>GET</code> methods


[View Project](https://jmoten212.github.io/world-cup-web-scraper/) &emsp; | &emsp; [View Code](https://github.com/jmoten212/world-cup-web-scraper)

<h3>Key Features</h3>
<ul>
  <li>Playwright-powered web scraping in headless Chromium that pulls live scoring and assist stats tables from ESPN</li>
  <li>React frontend with a "Run Scraper" button that triggers scraping on demand, with a loading state and live status feedback</li>
  <li>Express backend that spawns the scraper as a child process and returns stdout/stderr results as JSON</li>
  <li>Environmentally aware backend URL — automatically targets the local dev server in development and the Render-hosted server in production</li>
  <li>CORS origin allowlist that restricts API access to only GitHub Pages and local dev ports</li>
  <li>PostgreSQL storage for scraped data</li>
  <li>REST API with validation that can fetch stored data from PostgreSQL as JSON responses with a few <code>GET</code> methods and update it with a <code>POST</code> method</li>
  <li>A direct link to the project's GitHub repository with tooltip UI</li>
</ul>

<h3>What I Learned</h3>
<ul>
  <li>How to use Playwright for headless browser automation and scraping dynamically rendered pages</li>
  <li>How to build a custom Node HTTP server — manually handling routing, CORS preflight, headers and status codes</li>
  <li>How to spawn child processes in Node and capture their stdout/stderr to return as an API response</li>
  <li>How to configure CORS, including preflight OPTIONS handling and an origin allowlist</li>
  <li>How to use Render to host a backend server and use it with a static site like GitHub Pages for deployment</li>
  <li>How to use Vite environment variables (<code>import.meta.env</code>) to switch between dev and production API URLs</li>
</ul>

<h3>Future Improvements</h3>
<ul>
  <li>Add unit and integration tests</li>
  <li>Add more ESPN pages to scrape from to get more stat data</li>
  <li>Add more to design and UI to make the UX a bit more polished</li>
  <li>Improve accessibility</li>
</ul>

<h2>REST API</h2>

<h3>Base URL</h3>
<ul>
  <li>Local development: <code>http://localhost:3001</code></li>
  <li>Production: <code>https://world-cup-web-scraper-1.onrender.com</code></li>
</ul>

<h3>API Rules</h3>
<ul>
  <li>All endpoints return JSON</li>
  <li>Only allowed origins can call the API: <code>https://jmoten212.github.io</code>, <code>http://localhost:5173</code>, and <code>http://localhost:3001</code></li>
  <li>List endpoints use <code>limit</code> and <code>offset</code> for pagination</li>
  <li>Responses for list/detail routes include <code>ok</code>, <code>data</code>, and <code>pagination</code></li>
  <li>Scrape requests require Playwright Chromium to be installed on the server</li>
  <li>Scraped data is stored in PostgreSQL table <code>espn_player_stats</code></li>
  <li>Repeated scrapes upsert by <code>source_key</code> so the same row is updated instead of duplicated</li>
</ul>

<h3>Endpoint Reference</h3>

| Method | Route | Purpose | Query Params |
| --- | --- | --- | --- |
| GET | <code>/health</code> | Service and Playwright status check | None |
| GET | <code>/api/players</code> | List player summaries | <code>limit</code>, <code>offset</code>, <code>search</code> |
| GET | <code>/api/stats</code> | List stat rows | <code>limit</code>, <code>offset</code>, <code>player</code>, <code>team</code> |
| GET | <code>/api/players/:player</code> | Player summary + stats rows | <code>limit</code>, <code>offset</code> |
| GET | <code>/api/players/:player/stats</code> | Alias for player detail route | <code>limit</code>, <code>offset</code> |
| POST | <code>/api/scrape-espn</code> | Scrape ESPN and upsert into PostgreSQL | None |

<ul>
  <li><code>limit</code> - number of players to return, default <code>50</code></li>
  <li><code>offset</code> - starting position, default <code>0</code></li>
  <li><code>search</code> - optional case-insensitive player name search</li>
  <li><code>player</code> - optional case-insensitive player filter</li>
  <li><code>team</code> - optional case-insensitive team filter</li>
</ul>

<h3>GET /api/players</h3>
<p>Returns distinct player summaries grouped from stored stat rows.</p>

<h3>GET /api/stats</h3>
<p>Returns raw stat rows.</p>

<h3>GET /api/players/:player</h3>
<p>Returns one player summary and their stat rows.</p>

<h3>GET /api/players/:player/stats</h3>
<p>Alias of <code>/api/players/:player</code>.</p>

<h3>POST /api/scrape-espn</h3>
<p>Runs the scraper and stores the latest results in PostgreSQL.</p>

<h3>Example Requests</h3>
<pre><code>curl http://localhost:3001/api/players
curl "http://localhost:3001/api/stats?limit=25"
curl "http://localhost:3001/api/stats?player=Lionel%20Messi"
curl "http://localhost:3001/api/players/Lionel%20Messi"
curl -X POST http://localhost:3001/api/scrape-espn</code></pre>

<h3>Database</h3>
<ul>
  <li>Connection string: <code>DATABASE_URL</code></li>
  <li>Main table: <code>espn_player_stats</code></li>
  <li>Important columns: <code>scraped_at</code>, <code>source_key</code>, <code>player</code>, <code>team</code>, <code>goals</code>, <code>assists</code>, <code>raw</code></li>
</ul>

<h3>Run Scripts</h3>
<ul>
  <li><code>npm run scrape:server</code> - start the Express API server</li>
  <li><code>npm run store:espn</code> - scrape ESPN and store data in PostgreSQL from the CLI</li>
  <li><code>npm run scrape:espn</code> - print the scraped ESPN tables as JSON</li>
  <li><code>npm run api:smoke</code> - run smoke tests from the <code>smoke-api.sh</code> script</li>
</ul>

<h3>Contact</h3>
<b>Name:</b> James Moten <br>
<b>Email:</b> jmoten212@gmail.com <br>
<b>LinkedIn:</b> https://www.linkedin.com/in/james-moten/ <br>
