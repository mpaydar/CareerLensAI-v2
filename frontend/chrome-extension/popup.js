const STORAGE_KEY = 'latestHighlightedText';
const API_BASE_STORAGE_KEY = 'apiBaseUrl';
const LAST_HIGHLIGHT_ERROR_KEY = 'lastHighlightError';
const statusEl = document.getElementById('status');
const selectedTextEl = document.getElementById('selectedText');
const apiTargetEl = document.getElementById('apiTarget');

function renderApiTarget(origin) {
  if (!apiTargetEl) {
    return;
  }
  if (origin) {
    apiTargetEl.textContent = `Posting highlights to: ${origin}`;
    return;
  }
  apiTargetEl.textContent =
    'Posting highlights to: localhost:3000 (default). Open your app tab or set options.';
}

function renderHighlightError(error) {
  if (!error?.message) {
    return;
  }
  statusEl.textContent = error.message;
  statusEl.style.color = '#f87171';
}

chrome.storage.local.get([API_BASE_STORAGE_KEY, LAST_HIGHLIGHT_ERROR_KEY], (result) => {
  renderApiTarget(result[API_BASE_STORAGE_KEY] || '');
  if (result[LAST_HIGHLIGHT_ERROR_KEY]) {
    renderHighlightError(result[LAST_HIGHLIGHT_ERROR_KEY]);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[API_BASE_STORAGE_KEY]) {
    return;
  }
  renderApiTarget(changes[API_BASE_STORAGE_KEY].newValue || '');
});

function renderText(text, highlightError) {
  if (highlightError?.message) {
    renderHighlightError(highlightError);
    selectedTextEl.textContent = text?.trim()
      ? text
      : 'Captured locally — server sync failed (see status above).';
    return;
  }

  statusEl.style.color = '';

  if (text && text.trim().length > 0) {
    statusEl.textContent = 'Live: showing latest highlight';
    selectedTextEl.textContent = text;
    return;
  }

  statusEl.textContent = 'Waiting for highlighted text...';
  selectedTextEl.textContent = 'No text captured yet.';
}

chrome.storage.local.get([STORAGE_KEY, LAST_HIGHLIGHT_ERROR_KEY], (result) => {
  renderText(result[STORAGE_KEY] || '', result[LAST_HIGHLIGHT_ERROR_KEY]);
});

document.getElementById('openOptions')?.addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }

  if (changes[STORAGE_KEY] || changes[LAST_HIGHLIGHT_ERROR_KEY]) {
    chrome.storage.local.get([STORAGE_KEY, LAST_HIGHLIGHT_ERROR_KEY], (result) => {
      renderText(result[STORAGE_KEY] || '', result[LAST_HIGHLIGHT_ERROR_KEY]);
    });
  }
});
