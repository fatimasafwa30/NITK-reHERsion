# VeraTrace Chrome Extension (Manifest V3)

A privacy-preserving browser extension that streamlines the intake of online harassment evidence directly from the victim's active browser window.

---

## Capabilities & Epistemic Boundaries

### What It Does:
- **Lawful Active Tab Capture:** Captures only the webpage currently visible in the active browser tab when the user clicks **Capture Visible Tab** (`chrome.tabs.captureVisibleTab`).
- **Instant Client-Side Fingerprinting:** Computes a SHA-256 cryptographic hash of the raw PNG bytes inside the browser using the Web Crypto API before transmission.
- **Contextual Attribution:** Records capture timestamp (UTC), page title, and active URL.
- **Incident Tagging:** Allows the user to select the case, platform (Instagram, WhatsApp, Email, SMS, Telegram, Twitter/X, Discord), sender handle, and contextual notes.
- **Direct Vault Ingestion:** Streams the file into the local VeraTrace encrypted vault (`http://localhost:4000/api/cases/:id/evidence`).
- **Offline Resilience:** If the local VeraTrace vault is offline, captures are safely enqueued in `chrome.storage.local` so evidence is never lost.

### What It Does NOT Do (Epistemic Boundaries):
- **No Background Tracking:** The extension has no background web-browsing tracking or tab-spying permissions.
- **No Password Access:** Does not access passwords, form inputs, or cookies.
- **No Private Platform Scraping:** Does not bypass website authentication or scrape restricted APIs.
- **No Deleted Message Recovery:** Does not claim to recover messages deleted by the sender on external platform servers.

---

## How to Install in Google Chrome or Microsoft Edge

1. Open **Google Chrome** or **Microsoft Edge**.
2. Navigate to `chrome://extensions` (or `edge://extensions`).
3. Toggle on **Developer mode** (top right switch).
4. Click **Load unpacked** (top left button).
5. Select the `extension/` folder in this repository:
   ```text
   C:\Users\suwai\OneDrive\Desktop\vera\NITK-reHERsion\extension
   ```
6. The **VeraTrace — Digital Evidence Capture** extension icon will appear in your browser toolbar!
