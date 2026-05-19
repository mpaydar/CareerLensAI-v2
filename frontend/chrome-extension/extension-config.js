// Shared endpoint resolver for content script and service worker.
const API_BASE_STORAGE_KEY = "apiBaseUrl";

const DEFAULT_HIGHLIGHT_ENDPOINTS = [
  "http://localhost:3000/api/highlight",
  "http://127.0.0.1:3000/api/highlight",
  "http://localhost:3001/api/highlight",
  "http://127.0.0.1:3001/api/highlight",
];

function normalizeApiOrigin(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) {
    return "";
  }
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return url.origin;
  } catch {
    return "";
  }
}

function getHighlightEndpoints() {
  return new Promise((resolve) => {
    chrome.storage.local.get([API_BASE_STORAGE_KEY], (result) => {
      const endpoints = [...DEFAULT_HIGHLIGHT_ENDPOINTS];
      const origin = normalizeApiOrigin(result[API_BASE_STORAGE_KEY]);
      if (origin) {
        endpoints.unshift(`${origin}/api/highlight`);
      }
      resolve(endpoints);
    });
  });
}

const DEFAULT_APPLICATION_ENDPOINTS = DEFAULT_HIGHLIGHT_ENDPOINTS.map((url) =>
  url.replace("/api/highlight", "/api/applications"),
);

function getApplicationEndpoints() {
  return new Promise((resolve) => {
    chrome.storage.local.get([API_BASE_STORAGE_KEY], (result) => {
      const endpoints = [...DEFAULT_APPLICATION_ENDPOINTS];
      const origin = normalizeApiOrigin(result[API_BASE_STORAGE_KEY]);
      if (origin) {
        endpoints.unshift(`${origin}/api/applications`);
      }
      resolve(endpoints);
    });
  });
}
