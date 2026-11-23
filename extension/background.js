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
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          sendResponse({
            success: false,
            error: chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Failed to capture visible tab.',
          });
        } else {
          sendResponse({
            success: true,
            dataUrl,
            url: activeTab ? activeTab.url : (sender && sender.tab ? sender.tab.url : ''),
            title: activeTab ? activeTab.title : (sender && sender.tab ? sender.tab.title : 'Active Tab Capture'),
            timestamp: new Date().toISOString(),
          });
        }
      });
    });
    return true; // Keep message channel open for async response
  }

  return true;
});
