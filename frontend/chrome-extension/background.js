importScripts("extension-config.js");

const injectedTabs = new Set();

chrome.runtime.onInstalled.addListener((details) => {
  console.log(
    "[ResumeSnap] Extension updated — LinkedIn tabs will reload so highlights work again.",
  );
  if (details.reason !== "install" && details.reason !== "update") {
    return;
  }
  chrome.tabs.query({ url: ["*://*.linkedin.com/*", "*://linkedin.com/*"] }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.reload(tab.id).catch(() => {});
      }
    }
  });
});

function postJson(payload, endpoints, headers, index = 0) {
  const url = endpoints[index];
  if (!url) {
    return Promise.reject(new Error("all endpoints failed"));
  }

  return fetch(url, {
    method: "POST",
    headers,
    credentials: "omit",
    body: JSON.stringify(payload),
  }).then(async (response) => {
    if (response.ok) {
      console.log("[ResumeSnap] saved to", url);
      if (url.includes("/api/highlight")) {
        rememberSuccessfulHighlightEndpoint(url);
        clearHighlightError();
      }
      return response;
    }
    const detail = await response.text();
    const message = describeHighlightPostFailure(response.status, detail, url);
    if (url.includes("/api/highlight")) {
      rememberHighlightError(message);
    }
    console.warn("[ResumeSnap] POST", url, response.status, message);
    throw Object.assign(new Error(message), {
      __httpError: true,
    });
  }).catch((error) => {
    if (error && error.__httpError) {
      throw error;
    }
    console.warn("[ResumeSnap] fetch failed:", url, error);
    if (index + 1 >= endpoints.length) {
      throw error;
    }
    return postJson(payload, endpoints, headers, index + 1);
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

    void getExtensionFetchConfig()
      .then(({ headers }) =>
        getApplicationEndpoints().then((endpoints) =>
          postJson(payload, endpoints, headers),
        ),
      )
      .catch((error) => {
        console.warn("[ResumeSnap] application POST failed:", error);
      });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "HIGHLIGHT_CAPTURED") {
    const payload = {
      text: message.text || "",
      sourceUrl: message.sourceUrl || "",
    };

    // Fetch from the service worker (not the content script) to bypass page CSP.
    void getExtensionFetchConfig()
      .then(({ headers, endpoints }) => postJson(payload, endpoints, headers))
      .catch((error) => {
        console.warn("[ResumeSnap] highlight POST failed:", error);
      });
    sendResponse({ ok: true });
    return false;
  }
});

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
