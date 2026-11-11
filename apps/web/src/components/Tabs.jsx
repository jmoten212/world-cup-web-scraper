import React from 'react';

function Tabs({ activeTab, onTabChange }) {
  function handleTabKeyDown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    event.preventDefault();
    const nextTab =
      event.key === 'Home'
        ? 'scraper'
        : event.key === 'End'
          ? 'response'
          : activeTab === 'scraper'
            ? 'response'
            : 'scraper';
    onTabChange(nextTab);
    event.currentTarget.querySelector(`[data-tab="${nextTab}"]`)?.focus();
  }

  return (
    <div
      className="card-tabs"
      data-active-tab={activeTab}
      role="tablist"
      aria-label="Scraper views"
      onKeyDown={handleTabKeyDown}
    >
      <button
        type="button"
        role="tab"
        id="scraper-tab"
        data-tab="scraper"
        aria-selected={activeTab === 'scraper'}
        aria-controls="scraper-panel"
        tabIndex={activeTab === 'scraper' ? 0 : -1}
        onClick={() => onTabChange('scraper')}
      >
        Scraper
      </button>
      <button
        type="button"
        role="tab"
        id="response-tab"
        data-tab="response"
        aria-selected={activeTab === 'response'}
        aria-controls="response-panel"
        tabIndex={activeTab === 'response' ? 0 : -1}
        onClick={() => onTabChange('response')}
      >
        Stats Table
      </button>
    </div>
  );
}

export default Tabs;
