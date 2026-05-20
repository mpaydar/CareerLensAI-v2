// Shared endpoint resolver for content script and service worker.
const API_BASE_STORAGE_KEY = "apiBaseUrl";

function isExtensionContextValid() {
  try {
    return Boolean(chrome.runtime?.id);
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

/** When the dashboard tab loads, point the extension at that origin. */
function syncApiBaseFromAppPage() {
  if (!isResumeSnapAppPage()) {
    return;
  }

  const origin = window.location.origin;
  const pattern = `${origin}/*`;

  const saveOrigin = () => {
    if (!isExtensionContextValid()) {
      return;
    }
    try {
      chrome.storage.local.set({ [API_BASE_STORAGE_KEY]: origin }, () => {
        if (!chrome.runtime.lastError) {
          console.log("[ResumeSnap] API base synced to", origin);
        }
      });
    } catch {
      // Extension was reloaded — refresh this tab.
    }
  };

  if (!isExtensionContextValid() || !chrome.permissions?.request) {
    saveOrigin();
    return;
  }

  chrome.permissions.contains({ origins: [pattern] }, (hasPermission) => {
    if (hasPermission) {
      saveOrigin();
      return;
    }
    chrome.permissions.request({ origins: [pattern] }, (granted) => {
      if (granted) {
        saveOrigin();
      } else {
        console.warn(
          "[ResumeSnap] Allow access to",
          origin,
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

function getHighlightEndpoints() {
  return new Promise((resolve) => {
    const endpoints = [...DEFAULT_HIGHLIGHT_ENDPOINTS];
    if (!isExtensionContextValid()) {
      resolve(endpoints);
      return;
    }
    try {
      chrome.storage.local.get([API_BASE_STORAGE_KEY], (result) => {
        const origin = normalizeApiOrigin(result[API_BASE_STORAGE_KEY]);
        if (origin) {
          endpoints.unshift(`${origin}/api/highlight`);
        }
        resolve(endpoints);
      });
    } catch {
      resolve(endpoints);
    }
  });
}

const DEFAULT_APPLICATION_ENDPOINTS = DEFAULT_HIGHLIGHT_ENDPOINTS.map((url) =>
  url.replace("/api/highlight", "/api/applications"),
);

function getApplicationEndpoints() {
  return new Promise((resolve) => {
    const endpoints = [...DEFAULT_APPLICATION_ENDPOINTS];
    if (!isExtensionContextValid()) {
      resolve(endpoints);
      return;
    }
    try {
      chrome.storage.local.get([API_BASE_STORAGE_KEY], (result) => {
        const origin = normalizeApiOrigin(result[API_BASE_STORAGE_KEY]);
        if (origin) {
          endpoints.unshift(`${origin}/api/applications`);
        }
        resolve(endpoints);
      });
    } catch {
      resolve(endpoints);
    }
  });
}
