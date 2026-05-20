importScripts("extension-config.js");

const injectedTabs = new Set();

chrome.runtime.onInstalled.addListener(() => {
  console.log(
    "[ResumeSnap] Extension updated — refresh open LinkedIn tabs, then open your dashboard once to sync the API URL.",
  );
});

function postHighlight(payload, endpoints, index = 0) {
  const url = endpoints[index];
  if (!url) {
    return Promise.reject(new Error("all live view endpoints failed"));
  }

  return fetch(url, {
    method: "POST",
    headers: EXTENSION_FETCH_HEADERS,
    credentials: "omit",
    body: JSON.stringify(payload),
  }).then(async (response) => {
      if (response.ok) {
        console.log("[ResumeSnap] highlight saved to", url);
        return response;
      }
      const detail = await response.text();
      console.warn("[ResumeSnap] live view POST", url, response.status, detail);
      throw Object.assign(new Error(detail || `HTTP ${response.status}`), {
        __httpError: true,
      });
    })
    .catch((error) => {
      if (error && error.__httpError) {
        throw error;
      }
      console.warn("[ResumeSnap] live view fetch failed:", url, error);
      if (index + 1 >= endpoints.length) {
        throw error;
      }
      return postHighlight(payload, endpoints, index + 1);
    });
}

async function injectPageSelection(tabId) {
  if (injectedTabs.has(tabId)) {
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: "MAIN",
      files: ["page-selection.js"],
    });
    injectedTabs.add(tabId);
  } catch (error) {
    console.warn("[ResumeSnap] inject page-selection.js failed:", error);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) {
    return;
  }

  if (message.type === "INJECT_PAGE_SELECTION" && sender.tab?.id != null) {
    injectPageSelection(sender.tab.id)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "EASY_APPLY_DETECTED") {
    const payload = {
      jobId: message.jobId || "",
      sourceUrl: message.sourceUrl || "",
      appliedAt: message.appliedAt || new Date().toISOString(),
    };

    getApplicationEndpoints()
      .then((endpoints) => postHighlight(payload, endpoints))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.warn("[ResumeSnap] application POST failed:", error);
        sendResponse({ ok: false, error: String(error) });
      });

    return true;
  }

  if (message.type !== "HIGHLIGHT_CAPTURED") {
    return;
  }

  const payload = {
    text: message.text || "",
    sourceUrl: message.sourceUrl || "",
  };

  getHighlightEndpoints()
    .then((endpoints) => postHighlight(payload, endpoints))
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.warn("[ResumeSnap] live view POST failed:", error);
      sendResponse({ ok: false, error: String(error) });
    });

  return true;
});

// Re-inject after navigation on LinkedIn (SPA).
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) {
    return;
  }
  if (!/linkedin\.com/i.test(tab.url)) {
    return;
  }
  injectedTabs.delete(tabId);
  injectPageSelection(tabId);
});
