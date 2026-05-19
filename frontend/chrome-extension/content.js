// content.js — bridge between the page (main world) and the ResumeSnap dev server.

if (typeof syncApiBaseFromAppPage === "function") {
  syncApiBaseFromAppPage();
}

const STORAGE_KEY = "latestHighlightedText";

let lastPublishedText = "";
let lastPublishedAt = 0;
let lastKnownJobId = "";
let selectionDebounce = null;
let pageBridgeRequested = false;

function extractJobIdFromUrl(url) {
  try {
    const parsed = new URL(url);
    const fromQuery =
      parsed.searchParams.get("currentJobId") ||
      parsed.searchParams.get("jobId") ||
      parsed.searchParams.get("job_id");
    if (fromQuery) {
      return fromQuery;
    }
    const pathMatch = parsed.pathname.match(/\/jobs\/view\/(\d+)/i);
    return pathMatch ? pathMatch[1] : "";
  } catch {
    return "";
  }
}

function resetPublishMemory() {
  lastPublishedText = "";
  lastPublishedAt = 0;
}

function isLinkedInHost() {
  return /(^|\.)linkedin\.com$/i.test(window.location.hostname);
}

function requestPageWorldBridge() {
  if (pageBridgeRequested || !isLinkedInHost()) {
    return;
  }
  pageBridgeRequested = true;
  chrome.runtime.sendMessage({ type: "INJECT_PAGE_SELECTION" }, () => {
    if (chrome.runtime.lastError) {
      console.warn("[ResumeSnap] page bridge inject:", chrome.runtime.lastError.message);
      pageBridgeRequested = false;
    }
  });
}

function postHighlightDirect(text, sourceUrl) {
  const payload = { text, sourceUrl };

  const tryEndpoint = (endpoints, index) => {
    const url = endpoints[index];
    if (!url) {
      return Promise.reject(new Error("all live view endpoints failed"));
    }
    return fetch(url, {
      method: "POST",
      headers: EXTENSION_FETCH_HEADERS,
      credentials: "omit",
      body: JSON.stringify(payload),
    }).then((response) => {
      if (response.ok) {
        console.log("[ResumeSnap] highlight saved to", url);
        return response;
      }
      if (index + 1 < endpoints.length) {
        return tryEndpoint(endpoints, index + 1);
      }
      return response.text().then((detail) => {
        throw new Error(detail || `HTTP ${response.status}`);
      });
    });
  };

  return getHighlightEndpoints().then((endpoints) => tryEndpoint(endpoints, 0));
}

function deliverHighlight(text, sourceUrl) {
  const selectedText = (text || "").trim();
  const jobId = extractJobIdFromUrl(sourceUrl || window.location.href);

  if (jobId && lastKnownJobId && jobId !== lastKnownJobId) {
    resetPublishMemory();
  }
  if (jobId) {
    lastKnownJobId = jobId;
  }

  if (!selectedText) {
    return;
  }

  if (
    /ReferenceError|DOMMatrix|Failed to load external module|ENOENT.*python/i.test(
      selectedText,
    )
  ) {
    return;
  }

  const now = Date.now();
  if (selectedText === lastPublishedText && now - lastPublishedAt < 2500) {
    return;
  }

  lastPublishedText = selectedText;
  lastPublishedAt = now;
  chrome.storage.local.set({ [STORAGE_KEY]: selectedText });

  chrome.runtime.sendMessage(
    {
      type: "HIGHLIGHT_CAPTURED",
      text: selectedText,
      sourceUrl: sourceUrl || window.location.href,
    },
    () => {
      if (chrome.runtime.lastError) {
        postHighlightDirect(selectedText, sourceUrl || window.location.href).catch(
          (err) => {
            console.warn("[ResumeSnap] highlight POST failed:", err);
          },
        );
      }
    },
  );

  console.log("[ResumeSnap] captured:", selectedText.slice(0, 80));
}

function getSelectedText() {
  const sel = window.getSelection();
  const text = sel ? sel.toString() : "";
  return text.trim();
}

function publishSelection() {
  deliverHighlight(getSelectedText(), window.location.href);
}

function schedulePublish() {
  const text = getSelectedText();
  if (!text) {
    clearTimeout(selectionDebounce);
    selectionDebounce = setTimeout(() => {
      if (!getSelectedText()) {
        resetPublishMemory();
      }
    }, 500);
    return;
  }
  clearTimeout(selectionDebounce);
  selectionDebounce = setTimeout(publishSelection, 350);
}

// Highlights from the page-world script (LinkedIn shadow DOM).
window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data) {
    return;
  }
  if (event.data.type !== "RESUMESNAP_HIGHLIGHT") {
    return;
  }
  deliverHighlight(event.data.text, event.data.sourceUrl);
});

// Fallback for sites without the page bridge (non-LinkedIn).
document.addEventListener("selectionchange", schedulePublish);
document.addEventListener("mouseup", schedulePublish);
document.addEventListener("keyup", (event) => {
  if (event.key === "Shift" || event.key.startsWith("Arrow")) {
    schedulePublish();
  }
});

function reportEasyApply(payload) {
  chrome.runtime.sendMessage(
    {
      type: "EASY_APPLY_DETECTED",
      jobId: payload.jobId,
      sourceUrl: payload.sourceUrl,
      appliedAt: payload.appliedAt,
    },
    () => {
      if (chrome.runtime.lastError) {
        getApplicationEndpoints()
          .then((endpoints) => {
            const tryPost = (index) => {
              const url = endpoints[index];
              if (!url) {
                return Promise.reject(new Error("no application endpoints"));
              }
              return fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              }).then((response) => {
                if (response.ok) {
                  return response;
                }
                if (index + 1 < endpoints.length) {
                  return tryPost(index + 1);
                }
                throw new Error(`HTTP ${response.status}`);
              });
            };
            return tryPost(0);
          })
          .catch((err) => {
            console.warn("[ResumeSnap] Easy Apply POST failed:", err);
          });
      }
    },
  );
  console.log("[ResumeSnap] Easy Apply likely submitted", payload.jobId);
}

document.addEventListener(
  "click",
  (event) => {
    if (window.ResumeSnapEasyApply?.recordClick) {
      window.ResumeSnapEasyApply.recordClick(event, reportEasyApply);
    }
  },
  true,
);

requestPageWorldBridge();

// When the live view clears highlights, allow the same selection to be sent again.
if (window.location.hostname === "localhost" && window.location.pathname === "/") {
  setInterval(() => {
    getHighlightEndpoints().then((endpoints) => {
      const localEndpoint = endpoints.find((url) => /localhost|127\.0\.0\.1/.test(url));
      if (!localEndpoint) {
        return;
      }
      fetch(localEndpoint, { cache: "no-store" })
        .then((response) => response.json())
        .then((data) => {
          if (!data?.text?.trim()) {
            resetPublishMemory();
          }
        })
        .catch(() => {});
    });
  }, 1500);
}
