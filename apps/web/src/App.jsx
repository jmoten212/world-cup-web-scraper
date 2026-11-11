import React, { useEffect, useState } from 'react';
import { Tooltip } from 'react-tooltip';
import Tabs from './components/Tabs';
import './main.css';

const STATS_PAGE_SIZE = 25;

function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [output, setOutput] = useState('');
  const [activeTab, setActiveTab] = useState('scraper');
  const [stats, setStats] = useState([]);
  const [statsPagination, setStatsPagination] = useState(null);
  const [statsOffset, setStatsOffset] = useState(0);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');
  const [statsRefresh, setStatsRefresh] = useState(0);
  const [lastScraped, setLastScraped] = useState('Loading...');

  const wcLogoUrl = `${import.meta.env.BASE_URL}images/2026_wc_logo.webp`;
  const gitLogoUrl = `${import.meta.env.BASE_URL}images/git_icon.png`;
  const scrapeApiBaseUrl =
    import.meta.env.VITE_SCRAPE_API_URL ||
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

      setStatus('Scraper finished successfully ✔️');
      setOutput(JSON.stringify(data, null, 2));
      setStatsOffset(0);
      setStatsRefresh((current) => current + 1);
    } catch (error) {
      setStatus('Scraper failed');
      setOutput(error?.message || 'Unknown error');
    } finally {
      setIsRunning(false);
    }
  }

  useEffect(() => {
    if (activeTab !== 'response') return undefined;

    const controller = new AbortController();
    const params = new URLSearchParams({ limit: STATS_PAGE_SIZE, offset: statsOffset });

    async function loadStats() {
      setStatsLoading(true);
      setStatsError('');

      try {
        const response = await fetch(`${scrapeApiBaseUrl}/api/stats?${params}`, {
          signal: controller.signal,
        });
        const data = await response.json();

        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || 'Failed to load stats');
        }
        if (!Array.isArray(data.data) || !data.pagination) {
          throw new Error('Invalid stats response');
        }

        if (!controller.signal.aborted) {
          setStats(data.data.map((row) => ({ ...row, gamesPlayed: row.raw?.P ?? null })));
          setStatsPagination(data.pagination);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setStatsError(error?.message || 'Failed to load stats');
        }
      } finally {
        if (!controller.signal.aborted) setStatsLoading(false);
      }
    }

    loadStats();
    return () => controller.abort();
  }, [activeTab, scrapeApiBaseUrl, statsOffset, statsRefresh]);

  useEffect(() => {
    if (activeTab !== 'response') return undefined;

    const controller = new AbortController();

    async function loadLastScraped() {
      setLastScraped('Loading...');

      try {
        const response = await fetch(`${scrapeApiBaseUrl}/api/stats?limit=1`, {
          signal: controller.signal,
        });
        const data = await response.json();

        if (!response.ok || !data?.ok || !Array.isArray(data.data)) {
          throw new Error('Failed to load the latest scrape time');
        }

        const scrapedAt = data.data[0]?.scraped_at;
        const date = scrapedAt ? new Date(scrapedAt) : null;
        if (!controller.signal.aborted) {
          setLastScraped(
            date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'Unavailable',
          );
        }
      } catch {
        if (!controller.signal.aborted) setLastScraped('Unavailable');
      }
    }

    loadLastScraped();
    return () => controller.abort();
  }, [activeTab, scrapeApiBaseUrl, statsRefresh]);

  return (
    <>
      <div className="card-container">
        <Tabs activeTab={activeTab} onTabChange={setActiveTab} />
        <div
          className="app-shell tab-panel"
          role="tabpanel"
          id="scraper-panel"
          aria-labelledby="scraper-tab"
          hidden={activeTab !== 'scraper'}
        >
          <div className="scrape-button-wc-logo">
            <button className="scrape-button" onClick={runScraper} disabled={isRunning}>
              {isRunning ? 'Running...' : 'Run Scraper'}
            </button>
            <img src={wcLogoUrl} alt="FIFA World Cup 2026 logo" />
          </div>
          <p className="status-text">{status}</p>
          <p className="backend-text">Using backend: {scrapeApiBaseUrl}</p>
          <pre className="output-box">
            {output ||
              (isRunning
                ? 'Waiting for the scraper response...'
                : 'Run the scraper to see its response.')}
          </pre>
        </div>
        <div
          className="response-panel tab-panel"
          role="tabpanel"
          id="response-panel"
          aria-labelledby="response-tab"
          tabIndex={0}
          hidden={activeTab !== 'response'}
        >
          <h2>Player Stats</h2>
          <p className="last-scraped" aria-live="polite">
            (Last scraped at {lastScraped})
          </p>
          {statsLoading && <p role="status">Loading stats...</p>}
          {statsError && (
            <div role="alert">
              <p>{statsError}</p>
              <button type="button" onClick={() => setStatsRefresh((current) => current + 1)}>
                Try again
              </button>
            </div>
          )}
          {!statsLoading && !statsError && stats.length === 0 && (
            <>
              <p>{statsOffset === 0 ? 'No stats available yet.' : 'No stats on this page.'}</p>
              {statsOffset > 0 && (
                <div className="stats-pagination">
                  <button
                    type="button"
                    onClick={() =>
                      setStatsOffset((current) => Math.max(0, current - STATS_PAGE_SIZE))
                    }
                  >
                    Previous
                  </button>
                </div>
              )}
            </>
          )}
          {!statsLoading && !statsError && stats.length > 0 && (
            <>
              <div className="stats-table-container">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th scope="col">Player</th>
                      <th scope="col">Team</th>
                      <th scope="col">Games Played</th>
                      <th scope="col">Goals</th>
                      <th scope="col">Assists</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((row) => (
                      <tr key={row.id}>
                        <td>{row.player || '-'}</td>
                        <td>{row.team || '-'}</td>
                        <td>{row.gamesPlayed ?? '-'}</td>
                        <td>{row.goals ?? '-'}</td>
                        <td>{row.assists ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {statsPagination && (
                <div className="stats-pagination">
                  <button
                    type="button"
                    disabled={statsOffset === 0}
                    onClick={() =>
                      setStatsOffset((current) => Math.max(0, current - STATS_PAGE_SIZE))
                    }
                  >
                    Previous
                  </button>
                  <span className="pagination-btn-count">
                    {statsOffset + 1}–{statsOffset + stats.length} of {statsPagination.total}
                  </span>
                  <button
                    type="button"
                    disabled={!statsPagination.hasMore}
                    onClick={() => setStatsOffset((current) => current + STATS_PAGE_SIZE)}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="repo-link">
        <a
          href="https://github.com/jmoten212/world-cup-web-scraper"
          data-tooltip-id="gh-repo-link"
          data-tooltip-place="right"
          target="_blank"
          rel="noreferrer noopener"
        >
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
