<h1>World Cup Web Scraper</h1>

Created a web scraper with Playwright that uses React in the frontend and a Node server in the backend to scrape the stats for the leading scorers and assisters at the 2026 FIFA World Cup. It scrapes the data from the tables found at https://www.espn.com/soccer/stats/_/league/fifa.world and uses the backend server running at https://world-cup-web-scraper-1.onrender.com for the live production version of the app


[View Project](https://jmoten212.github.io/world-cup-web-scraper/) &emsp; | &emsp; [View Code](https://github.com/jmoten212/world-cup-web-scraper)

<h3>Key Features</h3>
<ul>
  <li>Playwright-powered web scraping in headless Chromium that pulls live scoring and assist stats tables from ESPN</li>
  <li>React frontend with a "Run Scraper" button that triggers scraping on demand, with a loading state and live status feedback</li>
  <li>Custom Node HTTP backend that spawns the scraper as a child process and returns stdout/stderr results as JSON</li>
  <li>Environmentally aware backend URL — automatically targets the local dev server in development and the Render-hosted server in production</li>
  <li>CORS origin allowlist that restricts API access to only GitHub Pages and local dev ports</li>
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

<h3>Contact</h3>
<b>Name:</b> James Moten <br>
<b>Email:</b> jmoten212@gmail.com <br>
<b>LinkedIn:</b> https://www.linkedin.com/in/james-moten/ <br>
