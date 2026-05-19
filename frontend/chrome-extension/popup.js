const STORAGE_KEY = 'latestHighlightedText';
const statusEl = document.getElementById('status');
const selectedTextEl = document.getElementById('selectedText');

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
