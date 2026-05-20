// Shared endpoint resolver for content script and service worker.
const API_BASE_STORAGE_KEY = "apiBaseUrl";
const LAST_OK_HIGHLIGHT_KEY = "lastOkHighlightEndpoint";

function isExtensionContextValid() {
  try {
    return Boolean(chrome.runtime.id);
  } catch {
    return false;
  }
}

const DEFAULT_HIGHLIGHT_ENDPOINTS = [
  "http://localhost:3000/api/highlight",
  "http://127.0.0.1:3000/api/highlight",
  "http://localhost:3001/api/highlight",
  "http://127.0.0.1:3001/api/highlight",
];

function isResumeSnapAppPage() {
  if (typeof document === "undefined") {
    return false;
  }
  if (document.querySelector('meta[name="resumesnap-app"]')) {
    return true;
  }
  if (document.documentElement?.dataset?.resumesnapApp === "1") {
    return true;
  }
  return document.title.includes("ResumeSnap");
}

function readMetaApiOrigin() {
  const meta = document.querySelector('meta[name="resumesnap-api-origin"]');
  return meta ? normalizeApiOrigin(meta.getAttribute("content") || "") : "";
}

/** When the dashboard tab loads, point the extension at that origin. */
function syncApiBaseFromAppPage() {
  if (!isResumeSnapAppPage()) {
    return;
  }

  const metaOrigin = readMetaApiOrigin();
  const origin = window.location.origin;
  const targetOrigin = metaOrigin || origin;
  const pattern = `${targetOrigin}/*`;

  const saveOrigin = (value) => {
    if (!isExtensionContextValid()) {
      return;
    }
    try {
      chrome.storage.local.set({ [API_BASE_STORAGE_KEY]: value }, () => {
        if (!chrome.runtime.lastError) {
          console.log("[ResumeSnap] API base synced to", value);
        }
      });
    } catch {
      // Extension was reloaded — refresh this tab.
    }
  };

  saveOrigin(targetOrigin);

  if (!isExtensionContextValid() || !chrome.permissions?.request) {
    return;
  }

  chrome.permissions.contains({ origins: [pattern] }, (hasPermission) => {
    if (hasPermission) {
      return;
    }
    chrome.permissions.request({ origins: [pattern] }, (granted) => {
      if (!granted) {
        console.warn(
          "[ResumeSnap] Allow access to",
          targetOrigin,
          "in extension options so highlights reach this app.",
        );
      }
    });
  });
}

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

const EXTENSION_FETCH_HEADERS = {
  "Content-Type": "application/json",
  "X-ResumeSnap-Source": "extension",
};

function uniqueEndpoints(urls) {
  const seen = new Set();
  const out = [];
  for (const url of urls) {
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    out.push(url);
  }
  return out;
}

function getHighlightEndpoints() {
  return new Promise((resolve) => {
    const fallback = [...DEFAULT_HIGHLIGHT_ENDPOINTS];
    if (!isExtensionContextValid()) {
      resolve(fallback);
      return;
    }
    try {
      chrome.storage.local.get(
        [API_BASE_STORAGE_KEY, LAST_OK_HIGHLIGHT_KEY],
        (result) => {
          const ordered = [];
          const lastOk = (result[LAST_OK_HIGHLIGHT_KEY] || "").trim();
          const origin = normalizeApiOrigin(result[API_BASE_STORAGE_KEY]);
          if (lastOk) {
            ordered.push(lastOk);
          }
          if (origin) {
            ordered.push(`${origin}/api/highlight`);
          }
          resolve(uniqueEndpoints([...ordered, ...fallback]));
        },
      );
    } catch {
      resolve(fallback);
    }
  });
}

function rememberSuccessfulHighlightEndpoint(url) {
  if (!url || !isExtensionContextValid()) {
    return;
  }
  try {
    chrome.storage.local.set({ [LAST_OK_HIGHLIGHT_KEY]: url });
  } catch {
    // ignore
  }
}

const DEFAULT_APPLICATION_ENDPOINTS = DEFAULT_HIGHLIGHT_ENDPOINTS.map((url) =>
  url.replace("/api/highlight", "/api/applications"),
);

function getApplicationEndpoints() {
  return new Promise((resolve) => {
    const fallback = [...DEFAULT_APPLICATION_ENDPOINTS];
    if (!isExtensionContextValid()) {
      resolve(fallback);
      return;
    }
    try {
      chrome.storage.local.get([API_BASE_STORAGE_KEY], (result) => {
        const ordered = [];
        const origin = normalizeApiOrigin(result[API_BASE_STORAGE_KEY]);
        if (origin) {
          ordered.push(`${origin}/api/applications`);
        }
        resolve(uniqueEndpoints([...ordered, ...fallback]));
      });
    } catch {
      resolve(fallback);
    }
  });
}
