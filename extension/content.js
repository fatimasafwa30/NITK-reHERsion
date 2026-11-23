/**
 * VeraTrace Chrome Extension — Content Script Bridge
 *
 * Facilitates safe, permissioned communication between the VeraTrace web application
 * and the Manifest V3 background service worker.
 */

// Announce presence immediately to the DOM and window
try {
  document.documentElement.setAttribute('data-veratrace-extension', '2.0.0');
} catch {
  // DOM not yet ready
}

window.postMessage({ type: 'VERATRACE_EXTENSION_READY', version: '2.0.0', status: 'connected' }, '*');

// Broadcast paired credential state to the VeraTrace application
function broadcastAuthState() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['veratrace_extension_token', 'veratrace_paired_user'], (res) => {
      if (res && res.veratrace_extension_token) {
        window.postMessage({
          type: 'VERATRACE_EXTENSION_AUTH_STATE',
          paired: true,
          extensionToken: res.veratrace_extension_token,
          pairedUser: res.veratrace_paired_user || null,
        }, '*');
      }
    });
  }
}

// Initial broadcast
broadcastAuthState();

// Listen for storage changes (e.g. user just paired in popup)
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.veratrace_extension_token || changes.veratrace_paired_user)) {
      broadcastAuthState();
    }
  });
}

// Listen for messages pushed from the extension popup or background worker (e.g. activeTab capture)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.action === 'PING') {
    sendResponse({ pong: true, version: '2.0.0' });
    return true;
  }
  if (message && message.action === 'VERATRACE_CAPTURE_RECEIVED') {
    window.postMessage({
      type: 'VERATRACE_CAPTURE_RECEIVED',
      ...message,
    }, '*');
    sendResponse({ received: true });
    return true;
  }
  return false;
});

// Listen for messages from the web application
window.addEventListener('message', (event) => {
  // Only accept messages from same window
  if (event.source !== window || !event.data || typeof event.data !== 'object') return;

  if (event.data.type === 'VERATRACE_PING_EXTENSION') {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['veratrace_extension_token', 'veratrace_paired_user'], (res) => {
        window.postMessage({
          type: 'VERATRACE_PONG_EXTENSION',
          installed: true,
          version: '2.0.0',
          connected: true,
          paired: Boolean(res?.veratrace_extension_token),
          extensionToken: res?.veratrace_extension_token || null,
          pairedUser: res?.veratrace_paired_user || null,
        }, '*');
      });
    } else {
      window.postMessage({
        type: 'VERATRACE_PONG_EXTENSION',
        installed: true,
        version: '2.0.0',
        connected: true,
      }, '*');
    }
    return;
  }

  if (event.data.type === 'VERATRACE_CAPTURE_CURRENT_TAB_REQUEST') {
    try {
      chrome.runtime.sendMessage({ action: 'CAPTURE_ACTIVE_TAB' }, (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage({
            type: 'VERATRACE_CAPTURE_CURRENT_TAB_RESPONSE',
            success: false,
            error: chrome.runtime.lastError.message || 'Extension communication error.',
          }, '*');
        } else {
          window.postMessage({
            type: 'VERATRACE_CAPTURE_CURRENT_TAB_RESPONSE',
            ...response,
          }, '*');
        }
      });
    } catch (err) {
      window.postMessage({
        type: 'VERATRACE_CAPTURE_CURRENT_TAB_RESPONSE',
        success: false,
        error: err.message || 'Failed to dispatch capture request to extension background service.',
      }, '*');
    }
  }
});
