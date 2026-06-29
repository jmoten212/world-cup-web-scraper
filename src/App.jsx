import React, { useState } from "react";
import { Tooltip } from 'react-tooltip';
import './main.css'

function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [output, setOutput] = useState('');

  const wcLogoUrl = `${import.meta.env.BASE_URL}images/2026_wc_logo.webp`;
  const gitLogoUrl = `${import.meta.env.BASE_URL}images/git_icon.png`;
  const scrapeApiBaseUrl = import.meta.env.VITE_SCRAPE_API_URL ||
    (import.meta.env.PROD
      ? 'https://world-cup-web-scraper-1.onrender.com'
      : 'http://localhost:3001');

  async function runScraper() {
    setIsRunning(true);
    setStatus('Running scraper...');
    setOutput('');

    try {
      const response = await fetch(`${scrapeApiBaseUrl}/api/scrape-espn`, {
        method: 'POST',
      });

      const data = await response.json();
      const errorMessage = data?.error || 'Scraper failed';

      if (!response.ok) {
        throw new Error(errorMessage);
      }

      if (!data?.ok) {
        throw new Error(errorMessage);
      }

      setStatus(data.exitCode === 0
        ? 'Scraper finished successfully ✔️'
        : 'Scraper exited with an error ❌');
      setOutput(data.stdout || data.stderr || JSON.stringify(data, null, 2));
    } catch (error) {
      setStatus('Scraper failed');
      setOutput(error?.message || 'Unknown error');
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <>
      <div className="card-container">
        <div className="app-shell">
          <div className="scrape-button-wc-logo">
            <button className="scrape-button" onClick={runScraper} disabled={isRunning}>
              {isRunning ? 'Running...' : 'Run Scraper'}
            </button>
            <img src={wcLogoUrl} alt="FIFA World Cup 2026 logo" />
          </div>
          <p className="status-text">{status}</p>
          <p className="backend-text">Using backend: {scrapeApiBaseUrl}</p>
          <pre className="output-box">{output}</pre>
        </div>
      </div>

      <div className="repo-link">
        <a href="https://github.com/jmoten212/world-cup-web-scraper" data-tooltip-id="gh-repo-link" data-tooltip-place="right">
          <img src={gitLogoUrl} alt="Git icon" className="git-icon" />
        </a>
      </div>
      <Tooltip id="gh-repo-link">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span className="tooltip-text">Link to GitHub Repository</span>
        </div>
      </Tooltip>
    </>
  );
}

export default App;
