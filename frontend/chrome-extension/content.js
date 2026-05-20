// content.js — bridge between the page (main world) and the ResumeSnap dev server.

if (typeof syncApiBaseFromAppPage === "function") {
  syncApiBaseFromAppPage();
  window.addEventListener("load", syncApiBaseFromAppPage);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      syncApiBaseFromAppPage();
    }
  });
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

function isExtensionContextValid() {
  try {
    return Boolean(chrome.runtime.id);
  } catch {
    return false;
  }
}

function showRefreshExtensionBanner() {
  const id = "resumesnap-refresh-banner";
  if (document.getElementById(id)) {
    return;
  }
  const bar = document.createElement("div");
  bar.id = id;
  bar.setAttribute("role", "alert");
  bar.textContent =
    "ResumeSnap: extension was updated — refresh this page (F5), then highlight again.";
  Object.assign(bar.style, {
    position: "fixed",
    bottom: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "2147483647",
    maxWidth: "92vw",
    padding: "12px 16px",
    borderRadius: "8px",
    background: "#7f1d1d",
    color: "#fff",
    font: "600 13px/1.4 system-ui, sans-serif",
    boxShadow: "0 4px 24px rgba(0,0,0,.35)",
  });
  document.documentElement.appendChild(bar);
}

function requestPageWorldBridge() {
  if (pageBridgeRequested || !isLinkedInHost() || !isExtensionContextValid()) {
    return;
  }
  pageBridgeRequested = true;
  try {
    chrome.runtime.sendMessage({ type: "INJECT_PAGE_SELECTION" }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[ResumeSnap] page bridge inject:", chrome.runtime.lastError.message);
        pageBridgeRequested = false;
      }
    });
  } catch (error) {
    console.warn(
      "[ResumeSnap] Extension was reloaded — refresh this LinkedIn tab, then highlight again.",
      error,
    );
    pageBridgeRequested = false;
  }
}

/** Relay highlight to the service worker (bypasses LinkedIn page CSP on fetch). */
function sendHighlightToBackground(selectedText, sourceUrl) {
  chrome.runtime.sendMessage(
    {
      type: "HIGHLIGHT_CAPTURED",
      text: selectedText,
      sourceUrl,
    },
    () => {
      if (chrome.runtime.lastError) {
        console.warn(
          "[ResumeSnap] background relay failed:",
          chrome.runtime.lastError.message,
        );
      }
    },
  );
}

function deliverHighlight(text, sourceUrl) {
  try {
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

    if (!isExtensionContextValid()) {
      showRefreshExtensionBanner();
      console.warn(
        "[ResumeSnap] Extension context invalidated — refresh this tab (F5), then highlight again.",
      );
      return;
    }

    lastPublishedText = selectedText;
    lastPublishedAt = now;

    const source = sourceUrl || window.location.href;

    try {
      chrome.storage.local.set({ [STORAGE_KEY]: selectedText }, () => void 0);
    } catch {
      showRefreshExtensionBanner();
      return;
    }

    sendHighlightToBackground(selectedText, source);

    console.log("[ResumeSnap] captured:", selectedText.slice(0, 80));
  } catch (error) {
    if (/invalidated/i.test(String(error))) {
      showRefreshExtensionBanner();
      console.warn("[ResumeSnap] refresh this LinkedIn tab (F5) after updating the extension.");
      return;
    }
    console.warn("[ResumeSnap] deliverHighlight error:", error);
  }
}

function getSelectedText() {
  const sel = window.getSelection();
  const text = sel ? sel.toString() : "";
  return text.trim();
}

function publishSelection() {
  try {
    deliverHighlight(getSelectedText(), window.location.href);
  } catch (error) {
    if (/invalidated/i.test(String(error))) {
      showRefreshExtensionBanner();
    }
  }
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
  if (!isExtensionContextValid()) {
    console.warn("[ResumeSnap] Easy Apply skipped — refresh this tab (F5).");
    return;
  }
  try {
    chrome.runtime.sendMessage(
      {
        type: "EASY_APPLY_DETECTED",
        jobId: payload.jobId,
        sourceUrl: payload.sourceUrl,
        appliedAt: payload.appliedAt,
      },
      () => {
        if (chrome.runtime.lastError) {
          console.warn("[ResumeSnap] Easy Apply relay failed:", chrome.runtime.lastError.message);
        }
      },
    );
  } catch {
    console.warn("[ResumeSnap] Easy Apply skipped — extension context invalid.");
  }
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
