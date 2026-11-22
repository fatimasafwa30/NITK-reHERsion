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
  }
  return true;
});
