const API_BASE_STORAGE_KEY = "apiBaseUrl";

const apiBaseInput = document.getElementById("apiBase");
const saveButton = document.getElementById("save");
const statusEl = document.getElementById("status");

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

chrome.storage.local.get([API_BASE_STORAGE_KEY], (result) => {
  if (result[API_BASE_STORAGE_KEY]) {
    apiBaseInput.value = result[API_BASE_STORAGE_KEY];
  }
});

saveButton.addEventListener("click", async () => {
  const origin = normalizeApiOrigin(apiBaseInput.value);
  if (!origin) {
    statusEl.textContent = "Enter a valid URL, e.g. https://your-app.vercel.app";
    return;
  }

  const pattern = `${origin}/*`;
  const hasPermission = await chrome.permissions.contains({ origins: [pattern] });
  if (!hasPermission) {
    const granted = await chrome.permissions.request({ origins: [pattern] });
    if (!granted) {
      statusEl.textContent =
        "Permission denied. Allow access to your app URL so highlights can be sent.";
      return;
    }
  }

  await chrome.storage.local.set({ [API_BASE_STORAGE_KEY]: origin });
  statusEl.textContent = `Saved. Highlights will post to ${origin}/api/highlight`;
});
