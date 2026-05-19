// Runs in the page's main world (not the extension isolated world).
// LinkedIn renders job text inside shadow DOM; only page-world getSelection() sees it.
(function () {
  if (window.__resumesnapPageSelection) {
    return;
  }
  window.__resumesnapPageSelection = true;

  let debounceTimer = null;

  function publishFromPage() {
    const text = (window.getSelection()?.toString() || "").trim();
    if (!text) {
      return;
    }
    window.postMessage(
      {
        type: "RESUMESNAP_HIGHLIGHT",
        text,
        sourceUrl: window.location.href,
      },
      "*",
    );
  }

  function schedulePublish() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(publishFromPage, 350);
  }

  document.addEventListener("selectionchange", schedulePublish, true);
  document.addEventListener("mouseup", schedulePublish, true);
  document.addEventListener(
    "keyup",
    (event) => {
      if (event.key === "Shift" || event.key.startsWith("Arrow")) {
        schedulePublish();
      }
    },
    true,
  );
})();
