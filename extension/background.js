/**
 * VeraTrace Chrome Extension — Background Service Worker (Manifest V3)
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[VeraTrace Extension] Installed successfully.');
  // Initialize default settings in chrome.storage.local
  chrome.storage.local.get(['apiUrl', 'defaultCaseId'], (res) => {
    if (!res.apiUrl) {
      chrome.storage.local.set({ apiUrl: 'http://localhost:4000/api' });
    }
  });
});

// Listener for messages from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PING') {
    sendResponse({ status: 'PONG', timestamp: new Date().toISOString() });
    return true;
  }

  if (request.action === 'CAPTURE_ACTIVE_TAB') {
    const targetWindowId = (sender && sender.tab && typeof sender.tab.windowId === 'number')
      ? sender.tab.windowId
      : undefined;

    const performCapture = (winId) => {
      const captureOptions = { format: 'png' };

      const callback = (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          const rawErr = chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Failed to capture visible tab.';
          const friendlyErr = rawErr.includes('activeTab') || rawErr.includes('<all_urls>')
            ? 'Tab access requires explicit extension invocation. Click the VeraTrace extension icon in your Chrome toolbar on this page to capture with activeTab authorization.'
            : rawErr;

          sendResponse({
            success: false,
            error: friendlyErr,
          });
        } else {
          chrome.storage.local.get(['veratrace_extension_token', 'veratrace_paired_user'], (auth) => {
            sendResponse({
              success: true,
              dataUrl,
              url: (sender && sender.tab && sender.tab.url) || '',
              title: (sender && sender.tab && sender.tab.title) || 'Active Tab Capture',
              timestamp: new Date().toISOString(),
              extensionToken: auth?.veratrace_extension_token || null,
              pairedUser: auth?.veratrace_paired_user || null,
            });
          });
        }
      };

      try {
        if (typeof winId === 'number') {
          chrome.tabs.captureVisibleTab(winId, captureOptions, callback);
        } else {
          chrome.tabs.captureVisibleTab(captureOptions, callback);
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    };

    if (typeof targetWindowId === 'number') {
      performCapture(targetWindowId);
    } else {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const activeTab = tabs && tabs[0];
        performCapture(activeTab?.windowId);
      });
    }

    return true; // Keep message channel open for async response
  }

  return true;
});
