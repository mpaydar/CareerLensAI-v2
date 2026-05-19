const STORAGE_KEY = 'latestHighlightedText';
const API_BASE_STORAGE_KEY = 'apiBaseUrl';
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

chrome.storage.local.get([API_BASE_STORAGE_KEY], (result) => {
  renderApiTarget(result[API_BASE_STORAGE_KEY] || '');
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[API_BASE_STORAGE_KEY]) {
    return;
  }
  renderApiTarget(changes[API_BASE_STORAGE_KEY].newValue || '');
});

function renderText(text) {
  if (text && text.trim().length > 0) {
    statusEl.textContent = 'Live: showing latest highlight';
    selectedTextEl.textContent = text;
    return;
  }

  statusEl.textContent = 'Waiting for highlighted text...';
  selectedTextEl.textContent = 'No text captured yet.';
}

chrome.storage.local.get([STORAGE_KEY], (result) => {
  renderText(result[STORAGE_KEY] || '');
});

document.getElementById('openOptions')?.addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[STORAGE_KEY]) {
    return;
  }

  renderText(changes[STORAGE_KEY].newValue || '');
});
