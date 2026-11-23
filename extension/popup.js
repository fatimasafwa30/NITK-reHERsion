/**
 * VeraTrace Chrome Extension — Client Controller (popup.js)
 *
 * Implements:
 * 1. Lawful tab screenshot capture via chrome.tabs.captureVisibleTab
 * 2. Client-side SHA-256 cryptographic hashing via Web Crypto API
 * 3. Case synchronization with VeraTrace local/hosted API
 * 4. Offline resilience: saves captures in chrome.storage.local if upload fails
 * 5. Review & context annotation before upload
 */

let currentCapture = null;
let activeTab = null;

// Dynamic API Base URL resolution
async function getApiBase() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['apiUrl'], (res) => {
        resolve(res.apiUrl || 'http://localhost:4000/api');
      });
    } else {
      resolve(localStorage.getItem('veratrace_api_url') || 'http://localhost:4000/api');
    }
  });
}

// Auth / Extension Storage Helpers
async function getStoredAuth() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['veratrace_extension_token', 'veratrace_paired_user'], (res) => {
        resolve({
          token: res.veratrace_extension_token || null,
          user: res.veratrace_paired_user || null,
        });
      });
    } else {
      resolve({
        token: localStorage.getItem('veratrace_extension_token'),
        user: JSON.parse(localStorage.getItem('veratrace_paired_user') || 'null'),
      });
    }
  });
}

async function setStoredAuth(token, user) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ veratrace_extension_token: token, veratrace_paired_user: user }, resolve);
    } else {
      localStorage.setItem('veratrace_extension_token', token);
      localStorage.setItem('veratrace_paired_user', JSON.stringify(user));
      resolve();
    }
  });
}

async function clearStoredAuth() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(['veratrace_extension_token', 'veratrace_paired_user'], resolve);
    } else {
      localStorage.removeItem('veratrace_extension_token');
      localStorage.removeItem('veratrace_paired_user');
      resolve();
    }
  });
}

function parseTokenPayload(token) {
  try {
    const part = token.split('.')[1];
    let base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

async function updatePairingUi() {
  const auth = await getStoredAuth();
  const unpairedView = document.getElementById('unpaired-view');
  const pairedView = document.getElementById('paired-view');
  const badge = document.getElementById('conn-badge');

  if (auth.token && auth.user) {
    if (unpairedView) unpairedView.style.display = 'none';
    if (pairedView) pairedView.style.display = 'block';
    const userEl = document.getElementById('paired-username');
    const credEl = document.getElementById('paired-cred-id');
    if (userEl) userEl.textContent = `@${auth.user.username || 'User'}`;
    if (credEl) credEl.textContent = auth.user.credentialId || 'Scoped Token';

    if (badge) {
      badge.textContent = `Paired: @${auth.user.username}`;
      badge.style.backgroundColor = '#ECFDF5';
      badge.style.color = '#065F46';
    }
  } else {
    if (unpairedView) unpairedView.style.display = 'block';
    if (pairedView) pairedView.style.display = 'none';
    if (badge) {
      badge.textContent = 'Unpaired (Auth Required)';
      badge.style.backgroundColor = '#FEF3C7';
      badge.style.color = '#92400E';
    }
  }
}

// Tab Switching
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));

    btn.classList.add('active');
    const targetPane = document.getElementById(btn.dataset.tab);
    if (targetPane) targetPane.classList.add('active');
  });
});

document.getElementById('btn-go-capture')?.addEventListener('click', () => {
  document.querySelector('[data-tab="tab-capture"]').click();
});

// Helper: Compute SHA-256 from Blob/ArrayBuffer
async function computeSha256(arrayBuffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Convert dataURL to Blob
function dataUrlToBlob(dataUrl) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// Initialize active tab information
async function initActiveTab() {
  const pageUrlEl = document.getElementById('page-url');
  const pageTitleEl = document.getElementById('page-title');

  try {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        activeTab = tab;
        pageUrlEl.textContent = tab.url || 'Internal Browser Page';
        pageTitleEl.textContent = tab.title || 'Untitled';
        detectPlatformFromUrl(tab.url);
      }
    } else {
      pageUrlEl.textContent = 'http://example.com/test-incident';
      pageTitleEl.textContent = 'Demo Web Page';
    }
  } catch (err) {
    pageUrlEl.textContent = 'Unable to query tab';
  }

  await updatePairingUi();
  fetchCases();
  renderHistory();
}

function detectPlatformFromUrl(url = '') {
  const select = document.getElementById('evidence-platform');
  if (!select || !url) return;
  const l = url.toLowerCase();
  if (l.includes('instagram.com')) select.value = 'Instagram';
  else if (l.includes('whatsapp.com')) select.value = 'WhatsApp';
  else if (l.includes('mail.google.com') || l.includes('outlook')) select.value = 'Email';
  else if (l.includes('t.me') || l.includes('telegram')) select.value = 'Telegram';
  else if (l.includes('twitter.com') || l.includes('x.com')) select.value = 'Twitter / X';
  else if (l.includes('discord.com')) select.value = 'Discord';
  else select.value = 'Other';
}

// Fetch active cases from VeraTrace API with Authentication
async function fetchCases() {
  const select = document.getElementById('case-select');
  const auth = await getStoredAuth();
  const apiBase = await getApiBase();
  const headers = {};
  if (auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }

  try {
    const res = await fetch(`${apiBase}/cases`, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data.cases && data.cases.length > 0) {
        select.innerHTML = '';
        data.cases.forEach((c) => {
          const opt = document.createElement('option');
          opt.value = c.case_id;
          opt.textContent = `${c.title} (${c.case_id})`;
          select.appendChild(opt);
        });
        const badge = document.getElementById('conn-badge');
        if (badge) {
          badge.textContent = auth.user ? `Paired: @${auth.user.username}` : 'Vault Connected';
          badge.style.backgroundColor = '#ECFDF5';
          badge.style.color = '#065F46';
        }
        return;
      }
    } else if (res.status === 401 || res.status === 403) {
      const badge = document.getElementById('conn-badge');
      if (badge) {
        badge.textContent = 'Auth Required (Pair Extension)';
        badge.style.backgroundColor = '#FEF2F2';
        badge.style.color = '#991B1B';
      }
    }
  } catch (err) {
    // Backend offline / standalone mode
    const badge = document.getElementById('conn-badge');
    if (badge) {
      badge.textContent = 'Offline Vault (Local Mode)';
      badge.style.backgroundColor = '#F3F4F6';
      badge.style.color = '#4B5563';
    }
  }
}

// Pairing action event listeners
document.getElementById('btn-save-pairing')?.addEventListener('click', async () => {
  const input = document.getElementById('pairing-token-input');
  const token = input?.value?.trim();
  if (!token) {
    showNotification('Please paste a valid extension pairing token.', 'error');
    return;
  }

  const apiBase = await getApiBase();

  // 1. Single-use short-lived pairing token (vtp_...) exchange flow
  if (token.startsWith('vtp_')) {
    try {
      showNotification('Exchanging pairing token with VeraTrace vault...', 'info', 2000);
      const res = await fetch(`${apiBase}/auth/extension-pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pairingToken: token,
          deviceName: 'Chrome MV3 Extension',
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        showNotification(`Pairing Rejected (${res.status}): ${errJson.error || 'Failed to exchange token.'}`, 'error', 8000);
        return;
      }

      const data = await res.json();
      const userObj = {
        userId: data.user.userId,
        username: data.user.username,
        credentialId: data.credentialId,
        expiresAt: data.expiresAt,
      };

      await setStoredAuth(data.extensionToken, userObj);
      if (input) input.value = '';
      await updatePairingUi();
      await fetchCases();
      showNotification(`Successfully paired with VeraTrace as @${userObj.username}!`, 'success', 5000);
      document.querySelector('[data-tab="tab-capture"]')?.click();
      return;
    } catch (err) {
      showNotification(`Connection error: ${err.message}. Ensure backend is running at ${apiBase}.`, 'error', 8000);
      return;
    }
  }

  // 2. Direct Scoped JWT Extension Token format fallback
  const payload = parseTokenPayload(token);
  if (payload && payload.userId) {
    const userObj = {
      userId: payload.userId,
      username: payload.username || 'User',
      credentialId: payload.credentialId || 'token',
      expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
    };

    await setStoredAuth(token, userObj);
    if (input) input.value = '';
    await updatePairingUi();
    await fetchCases();
    showNotification(`Successfully paired with VeraTrace as @${userObj.username}!`, 'success', 5000);
    document.querySelector('[data-tab="tab-capture"]')?.click();
    return;
  }

  showNotification('Invalid token structure. Paste a valid token generated in VeraTrace.', 'error', 6000);
});

// Save custom Backend API URL
document.getElementById('btn-save-api-url')?.addEventListener('click', async () => {
  const urlInput = document.getElementById('api-url-input');
  const urlVal = urlInput?.value?.trim();
  if (!urlVal) return;
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ apiUrl: urlVal }, () => {
      showNotification(`API endpoint updated: ${urlVal}`, 'success', 3000);
      fetchCases();
    });
  } else {
    localStorage.setItem('veratrace_api_url', urlVal);
    showNotification(`API endpoint updated: ${urlVal}`, 'success', 3000);
    fetchCases();
  }
});

document.getElementById('btn-unpair')?.addEventListener('click', async () => {
  await clearStoredAuth();
  await updatePairingUi();
  await fetchCases();
  showNotification('Extension disconnected and local credentials removed.', 'info');
});

// 1. Capture Visible Tab Action
document.getElementById('btn-capture-tab')?.addEventListener('click', async () => {
  const statusEl = document.getElementById('capture-status');
  statusEl.textContent = 'Capturing tab and computing SHA-256...';
  statusEl.className = 'status-msg';

  try {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.captureVisibleTab) {
      throw new Error('Chrome extension tabs API is not available in standalone preview.');
    }

    // Query active tab in the focused window
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      const [currentActive] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (currentActive) {
        activeTab = currentActive;
      }
    }

    const captureOptions = { format: 'png' };
    const winId = activeTab?.windowId;
    const dataUrl = typeof winId === 'number'
      ? await chrome.tabs.captureVisibleTab(winId, captureOptions)
      : await chrome.tabs.captureVisibleTab(captureOptions);
    const blob = dataUrlToBlob(dataUrl);
    const arrayBuffer = await blob.arrayBuffer();
    const sha256 = await computeSha256(arrayBuffer);
    const evidenceId = `ev_${crypto.randomUUID()}`;

    currentCapture = {
      evidenceId,
      dataUrl,
      blob,
      sha256,
      url: activeTab?.url || 'Unknown URL',
      title: activeTab?.title || 'Untitled',
      captureTimestamp: new Date().toISOString(),
      dimensions: { width: window.screen.width, height: window.screen.height },
    };

    statusEl.textContent = 'Capture successful! Reviewing evidence...';
    statusEl.className = 'status-msg success';

    showReview(currentCapture);
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'status-msg error';
  }
});

// Show Review Screen
function showReview(capture) {
  document.getElementById('no-capture-placeholder').style.display = 'none';
  document.getElementById('review-content').style.display = 'block';

  document.getElementById('preview-img').src = capture.dataUrl;
  document.getElementById('preview-hash').textContent = `SHA-256: ${capture.sha256.slice(0, 32)}...`;

  document.getElementById('tab-review-btn').click();
}

// Discard current capture
document.getElementById('btn-discard')?.addEventListener('click', () => {
  currentCapture = null;
  document.getElementById('no-capture-placeholder').style.display = 'block';
  document.getElementById('review-content').style.display = 'none';
  document.querySelector('[data-tab="tab-capture"]').click();
});

// 1. Relay captured evidence to an open VeraTrace web app tab
document.getElementById('btn-send-to-webapp')?.addEventListener('click', async () => {
  if (!currentCapture) return;

  const btn = document.getElementById('btn-send-to-webapp');
  btn.disabled = true;
  btn.textContent = 'Relaying...';

  try {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) {
      showNotification('Chrome tabs API not available in standalone mode.', 'error');
      btn.disabled = false;
      btn.textContent = 'Send to App →';
      return;
    }

    const tabs = await chrome.tabs.query({
      url: [
        'https://veratrace-app.vercel.app/*',
        'https://*.vercel.app/*',
        'http://localhost:*/*',
        'http://127.0.0.1:*/*',
      ],
    });

    if (!tabs || tabs.length === 0) {
      showNotification('No open VeraTrace web app tab found. Please open VeraTrace in another tab first.', 'info', 6000);
      btn.disabled = false;
      btn.textContent = 'Send to App →';
      return;
    }

    // Prefer a tab with /case/ or /capture in the URL
    const targetTab = tabs.find((t) => t.url && (t.url.includes('/case/') || t.url.includes('/capture'))) || tabs[0];

    // Check paired extension credentials
    const auth = await getStoredAuth();
    if (!auth || !auth.token) {
      showNotification('Authentication Required: Please pair this extension in the Pairing tab before sending evidence to the web app for vault sealing.', 'error', 6000);
      btn.disabled = false;
      btn.textContent = 'Send to App →';
      document.getElementById('tab-pairing-btn')?.click();
      return;
    }

    const payload = {
      action: 'VERATRACE_CAPTURE_RECEIVED',
      dataUrl: currentCapture.dataUrl,
      url: currentCapture.url,
      title: currentCapture.title,
      timestamp: currentCapture.captureTimestamp,
      sha256: currentCapture.sha256,
      platform: document.getElementById('evidence-platform')?.value || 'Other',
      senderHandle: document.getElementById('sender-handle')?.value || '',
      notes: document.getElementById('context-notes')?.value || '',
      extensionToken: auth.token,
      credentialId: auth.user?.credentialId || null,
      pairedUser: auth.user || null,
    };

    let delivered = false;
    try {
      const response = await chrome.tabs.sendMessage(targetTab.id, payload);
      delivered = Boolean(response?.received);
    } catch (err) {
      // If content script was not yet active in that tab, inject it programmatically and retry
      if (chrome.scripting && chrome.scripting.executeScript) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            files: ['content.js'],
          });
          await new Promise((r) => setTimeout(r, 150));
          const retryRes = await chrome.tabs.sendMessage(targetTab.id, payload);
          delivered = Boolean(retryRes?.received);
        } catch (scriptErr) {
          console.warn('Programmatic script injection retry failed:', scriptErr);
        }
      }
    }

    // Focus target VeraTrace tab and its window
    if (chrome.tabs.update && targetTab.id) {
      await chrome.tabs.update(targetTab.id, { active: true });
    }
    if (chrome.windows && chrome.windows.update && targetTab.windowId) {
      await chrome.windows.update(targetTab.windowId, { focused: true });
    }

    showNotification('Capture transmitted to VeraTrace web app! Switched to tab.', 'success', 3000);
    setTimeout(() => {
      window.close();
    }, 600);
  } catch (err) {
    showNotification(`Could not relay to web app: ${err.message}`, 'error', 6000);
    btn.disabled = false;
    btn.textContent = 'Send to App →';
  }
});

// 2. Save to Offline Vault (Local device only, no server upload claims)
document.getElementById('btn-save-offline')?.addEventListener('click', async () => {
  if (!currentCapture) return;

  const platform = document.getElementById('evidence-platform')?.value || 'Other';
  const senderHandle = document.getElementById('sender-handle')?.value || '';
  const notes = document.getElementById('context-notes')?.value || '';
  const caseId = document.getElementById('case-select')?.value || 'VT-OFFLINE-VAULT';

  saveToLocalHistory({
    evidenceId: currentCapture.evidenceId,
    filename: `offline_capture_${Date.now()}.png`,
    sha256: currentCapture.sha256,
    url: currentCapture.url,
    title: currentCapture.title,
    caseId,
    platform,
    senderHandle,
    notes,
    dataUrl: currentCapture.dataUrl,
    captureTimestamp: currentCapture.captureTimestamp,
    storedAt: new Date().toISOString(),
    status: 'STORED_OFFLINE',
  });

  showNotification(`Evidence saved to Offline Vault on this device (SHA-256: ${currentCapture.sha256.slice(0, 16)}...). Stored locally — NOT uploaded to server.`, 'info', 6000);

  currentCapture = null;
  document.getElementById('no-capture-placeholder').style.display = 'block';
  document.getElementById('review-content').style.display = 'none';
  document.querySelector('[data-tab="tab-history"]')?.click();
});

// Inline Notification System
function showNotification(message, type = 'info', durationMs = 5000) {
  const el = document.getElementById('inline-notification');
  if (!el) return;
  el.textContent = message;
  el.className = `inline-banner ${type}`;
  el.style.display = 'block';

  if (window._notifTimer) clearTimeout(window._notifTimer);
  window._notifTimer = setTimeout(() => {
    el.style.display = 'none';
  }, durationMs);
}

// 3. Upload to Server Vault (Requires pairing and genuine backend verification)
document.getElementById('evidence-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentCapture) return;

  const btnUpload = document.getElementById('btn-upload');
  btnUpload.disabled = true;
  btnUpload.textContent = 'Sealing in Server Vault...';

  const caseId = document.getElementById('case-select').value;
  const platform = document.getElementById('evidence-platform').value;
  const senderHandle = document.getElementById('sender-handle').value;
  const notes = document.getElementById('context-notes').value;

  const auth = await getStoredAuth();
  if (!auth.token) {
    showNotification('Authentication Required: Pair this extension in the Pairing tab before uploading to Server Vault.', 'error', 6000);
    btnUpload.disabled = false;
    btnUpload.textContent = 'Upload to Server Vault';
    document.getElementById('tab-pairing-btn')?.click();
    return;
  }

  const apiBase = await getApiBase();

  const formData = new FormData();
  formData.append('evidenceId', currentCapture.evidenceId);
  formData.append('file', currentCapture.blob, `capture_${Date.now()}.png`);
  formData.append('submissionSource', 'EXTENSION_CAPTURE');
  formData.append('submissionMethod', 'CHROME_EXT_MV3');
  formData.append('captureTimestamp', currentCapture.captureTimestamp);
  formData.append('sourceUrl', currentCapture.url);
  formData.append('platform', platform);
  formData.append('senderHandle', senderHandle);
  formData.append('notes', notes);

  try {
    const res = await fetch(`${apiBase}/cases/${caseId}/evidence`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      const serverEvidenceId = data.evidence?.evidence_id || currentCapture.evidenceId;

      saveToLocalHistory({
        evidenceId: serverEvidenceId,
        filename: data.evidence?.original_filename || `capture_${Date.now()}.png`,
        sha256: currentCapture.sha256,
        url: currentCapture.url,
        title: currentCapture.title,
        caseId,
        platform,
        senderHandle,
        notes,
        dataUrl: currentCapture.dataUrl,
        uploadedAt: new Date().toISOString(),
        status: 'SEALED_IN_SERVER_VAULT',
      });

      showNotification(`Evidence sealed in Server Vault! ID: ${serverEvidenceId} (SHA-256: ${currentCapture.sha256.slice(0, 16)}...)`, 'success', 6000);

      currentCapture = null;
      document.getElementById('no-capture-placeholder').style.display = 'block';
      document.getElementById('review-content').style.display = 'none';
      document.querySelector('[data-tab="tab-history"]').click();
    } else {
      const errJson = await res.json().catch(() => ({}));
      const errMsg = errJson.error || `Upload failed with HTTP ${res.status}`;
      showNotification(`Server Vault Upload Failed: ${errMsg}`, 'error', 8000);

      // Preserve capture in Offline Vault so evidence is NEVER lost
      saveToLocalHistory({
        evidenceId: currentCapture.evidenceId,
        filename: `capture_${Date.now()}.png`,
        sha256: currentCapture.sha256,
        url: currentCapture.url,
        title: currentCapture.title,
        caseId,
        platform,
        senderHandle,
        notes,
        dataUrl: currentCapture.dataUrl,
        captureTimestamp: currentCapture.captureTimestamp,
        storedAt: new Date().toISOString(),
        status: 'STORED_OFFLINE',
      });

      currentCapture = null;
      document.getElementById('no-capture-placeholder').style.display = 'block';
      document.getElementById('review-content').style.display = 'none';
      document.querySelector('[data-tab="tab-history"]').click();
    }
  } catch (err) {
    // Offline resilience: backend unavailable
    saveToLocalHistory({
      evidenceId: currentCapture.evidenceId,
      filename: `capture_${Date.now()}.png`,
      sha256: currentCapture.sha256,
      url: currentCapture.url,
      title: currentCapture.title,
      caseId,
      platform,
      senderHandle,
      notes,
      dataUrl: currentCapture.dataUrl,
      captureTimestamp: currentCapture.captureTimestamp,
      storedAt: new Date().toISOString(),
      status: 'STORED_OFFLINE',
    });

    showNotification(`Backend offline (${err.message}). Capture safely preserved in Offline Vault on this device!`, 'info', 7000);
    currentCapture = null;
    document.getElementById('no-capture-placeholder').style.display = 'block';
    document.getElementById('review-content').style.display = 'none';
    document.querySelector('[data-tab="tab-history"]').click();
  } finally {
    btnUpload.disabled = false;
    btnUpload.textContent = 'Upload to Server Vault';
  }
});

// Vault & History Management (chrome.storage.local)
let currentFilter = 'all';
let selectedDetailItem = null;

function saveToLocalHistory(entry) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['veratrace_history'], (res) => {
      const history = res.veratrace_history || [];
      // Replace existing entry by evidenceId if present, else prepend
      const existingIdx = history.findIndex((h) => h.evidenceId === entry.evidenceId);
      if (existingIdx >= 0) {
        history[existingIdx] = entry;
      } else {
        history.unshift(entry);
      }
      chrome.storage.local.set({ veratrace_history: history.slice(0, 60) }, renderHistory);
    });
  } else {
    const hist = JSON.parse(localStorage.getItem('veratrace_history') || '[]');
    const existingIdx = hist.findIndex((h) => h.evidenceId === entry.evidenceId);
    if (existingIdx >= 0) {
      hist[existingIdx] = entry;
    } else {
      hist.unshift(entry);
    }
    localStorage.setItem('veratrace_history', JSON.stringify(hist.slice(0, 60)));
    renderHistory();
  }
}

// History Filter Buttons
document.querySelectorAll('.btn-filter').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-filter').forEach((b) => {
      b.style.background = '#FFFFFF';
      b.style.color = '#4B5563';
      b.style.borderColor = '#D1D5DB';
    });
    btn.style.background = '#FAF5FF';
    btn.style.color = '#5B21B6';
    btn.style.borderColor = '#E5D9F2';
    currentFilter = btn.dataset.filter;
    renderHistory();
  });
});

function renderHistory() {
  const container = document.getElementById('history-list');
  if (!container) return;

  const displayList = (items) => {
    let filtered = items;
    if (currentFilter === 'server') {
      filtered = items.filter((i) => i.status === 'SEALED_IN_SERVER_VAULT' || i.status === 'SEALED_IN_VAULT');
    } else if (currentFilter === 'offline') {
      filtered = items.filter((i) => i.status === 'STORED_OFFLINE' || i.status === 'SAVED_LOCALLY_PENDING_SYNC');
    }

    if (!filtered || filtered.length === 0) {
      container.innerHTML = `<p class="text-muted text-xs">No captures in this view (${currentFilter}).</p>`;
      return;
    }

    container.innerHTML = '';
    filtered.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.style.cursor = 'pointer';

      const isServer = item.status === 'SEALED_IN_SERVER_VAULT' || item.status === 'SEALED_IN_VAULT';
      const badgeText = isServer ? 'Server Vault (Sealed)' : 'Offline Vault (Local)';
      const badgeColor = isServer ? '#059669' : '#D97706';
      const timestamp = item.uploadedAt || item.storedAt || item.captureTimestamp;

      el.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <span class="title" style="font-weight: 600;">${item.filename || 'Evidence Capture'}</span>
          <span style="font-size: 10px; font-weight: 600; color: ${badgeColor};">${badgeText}</span>
        </div>
        <div class="meta" style="margin-top: 4px;">
          <span class="text-xs text-muted mono">${item.sha256 ? item.sha256.slice(0, 20) + '...' : '—'}</span>
          <span>${timestamp ? new Date(timestamp).toLocaleTimeString() : ''}</span>
        </div>
      `;

      el.addEventListener('click', () => openVaultItemDetail(item));
      container.appendChild(el);
    });
  };

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['veratrace_history'], (res) => {
      displayList(res.veratrace_history || []);
    });
  } else {
    displayList(JSON.parse(localStorage.getItem('veratrace_history') || '[]'));
  }
}

// Open Detail View for an Evidence Item
function openVaultItemDetail(item) {
  selectedDetailItem = item;
  const detailEl = document.getElementById('vault-item-detail');
  if (!detailEl) return;

  detailEl.style.display = 'block';
  document.getElementById('detail-title').textContent = item.filename || 'Evidence Detail';

  const isServer = item.status === 'SEALED_IN_SERVER_VAULT' || item.status === 'SEALED_IN_VAULT';
  const statusEl = document.getElementById('detail-status');
  statusEl.textContent = isServer ? 'Sealed in Server Vault' : 'Stored in Offline Vault (Local Only)';
  statusEl.style.color = isServer ? '#059669' : '#D97706';

  document.getElementById('detail-sha256').textContent = item.sha256 || '—';
  document.getElementById('detail-time').textContent = new Date(item.captureTimestamp || item.uploadedAt || item.storedAt).toLocaleString();
  document.getElementById('detail-platform').textContent = item.platform || 'Other Web Platform';
  document.getElementById('detail-url').textContent = item.url || '—';

  const imgEl = document.getElementById('detail-img');
  if (item.dataUrl) {
    imgEl.src = item.dataUrl;
    imgEl.style.display = 'inline-block';
  } else {
    imgEl.style.display = 'none';
  }

  const uploadBtn = document.getElementById('btn-detail-upload-server');
  if (!isServer && item.dataUrl) {
    uploadBtn.style.display = 'block';
  } else {
    uploadBtn.style.display = 'none';
  }

  const verifyResult = document.getElementById('detail-verify-result');
  verifyResult.style.display = 'none';
}

document.getElementById('btn-close-detail')?.addEventListener('click', () => {
  const detailEl = document.getElementById('vault-item-detail');
  if (detailEl) detailEl.style.display = 'none';
  selectedDetailItem = null;
});

// Verify SHA-256 Integrity
document.getElementById('btn-verify-integrity')?.addEventListener('click', async () => {
  if (!selectedDetailItem) return;
  const verifyResult = document.getElementById('detail-verify-result');
  if (!verifyResult) return;

  verifyResult.style.display = 'block';
  verifyResult.textContent = 'Calculating cryptographic SHA-256...';
  verifyResult.style.background = '#F3F4F6';
  verifyResult.style.color = '#374151';

  try {
    if (!selectedDetailItem.dataUrl) {
      verifyResult.textContent = 'Original binary not stored locally for offline re-hashing (Sealed on server).';
      verifyResult.style.background = '#FEF3C7';
      verifyResult.style.color = '#92400E';
      return;
    }

    const blob = dataUrlToBlob(selectedDetailItem.dataUrl);
    const arrayBuffer = await blob.arrayBuffer();
    const computedHash = await computeSha256(arrayBuffer);

    if (computedHash.toLowerCase() === selectedDetailItem.sha256.toLowerCase()) {
      verifyResult.textContent = `✓ Integrity Verified: Recomputed SHA-256 matches stored forensic fingerprint bit-for-bit.`;
      verifyResult.style.background = '#ECFDF5';
      verifyResult.style.color = '#065F46';
    } else {
      verifyResult.textContent = `⚠ Hash Mismatch! Stored: ${selectedDetailItem.sha256.slice(0, 16)}..., Recomputed: ${computedHash.slice(0, 16)}...`;
      verifyResult.style.background = '#FEF2F2';
      verifyResult.style.color = '#991B1B';
    }
  } catch (err) {
    verifyResult.textContent = `Verification error: ${err.message}`;
    verifyResult.style.background = '#FEF2F2';
    verifyResult.style.color = '#991B1B';
  }
});

// Export Evidence & Forensic Metadata Package
document.getElementById('btn-export-evidence')?.addEventListener('click', () => {
  if (!selectedDetailItem) return;

  // 1. Export JSON metadata
  const metadata = {
    veratraceExportVersion: '2.0.0',
    evidenceId: selectedDetailItem.evidenceId,
    filename: selectedDetailItem.filename,
    sha256: selectedDetailItem.sha256,
    status: selectedDetailItem.status,
    caseId: selectedDetailItem.caseId,
    sourceUrl: selectedDetailItem.url,
    title: selectedDetailItem.title,
    platform: selectedDetailItem.platform,
    senderHandle: selectedDetailItem.senderHandle,
    notes: selectedDetailItem.notes,
    captureTimestamp: selectedDetailItem.captureTimestamp,
    exportedAt: new Date().toISOString(),
  };

  const jsonBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
  const jsonUrl = URL.createObjectURL(jsonBlob);
  const aJson = document.createElement('a');
  aJson.href = jsonUrl;
  aJson.download = `veratrace_metadata_${selectedDetailItem.evidenceId}.json`;
  aJson.click();
  URL.revokeObjectURL(jsonUrl);

  // 2. Export Image Binary if available
  if (selectedDetailItem.dataUrl) {
    const aImg = document.createElement('a');
    aImg.href = selectedDetailItem.dataUrl;
    aImg.download = selectedDetailItem.filename || `evidence_${selectedDetailItem.evidenceId}.png`;
    aImg.click();
  }

  showNotification('Forensic export package generated and downloaded.', 'success');
});

// Upload offline item to server once paired
document.getElementById('btn-detail-upload-server')?.addEventListener('click', async () => {
  if (!selectedDetailItem || !selectedDetailItem.dataUrl) return;

  const auth = await getStoredAuth();
  if (!auth.token) {
    showNotification('Authentication Required: Pair extension in Pairing tab before uploading.', 'error');
    document.getElementById('tab-pairing-btn')?.click();
    return;
  }

  const btn = document.getElementById('btn-detail-upload-server');
  btn.disabled = true;
  btn.textContent = 'Uploading...';

  try {
    const apiBase = await getApiBase();
    const blob = dataUrlToBlob(selectedDetailItem.dataUrl);
    const formData = new FormData();
    formData.append('evidenceId', selectedDetailItem.evidenceId);
    formData.append('file', blob, selectedDetailItem.filename);
    formData.append('submissionSource', 'EXTENSION_CAPTURE');
    formData.append('submissionMethod', 'CHROME_EXT_MV3_OFFLINE_UPLOAD');
    formData.append('captureTimestamp', selectedDetailItem.captureTimestamp || selectedDetailItem.storedAt);
    formData.append('sourceUrl', selectedDetailItem.url || '');
    formData.append('platform', selectedDetailItem.platform || 'Other');
    formData.append('senderHandle', selectedDetailItem.senderHandle || '');
    formData.append('notes', selectedDetailItem.notes || '');

    const res = await fetch(`${apiBase}/cases/${selectedDetailItem.caseId || 'VT-DEMO-2026'}/evidence`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}` },
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      selectedDetailItem.status = 'SEALED_IN_SERVER_VAULT';
      selectedDetailItem.evidenceId = data.evidence?.evidence_id || selectedDetailItem.evidenceId;
      selectedDetailItem.uploadedAt = new Date().toISOString();
      saveToLocalHistory(selectedDetailItem);
      openVaultItemDetail(selectedDetailItem);
      showNotification('Evidence successfully uploaded and sealed in Server Vault!', 'success');
    } else {
      const err = await res.json().catch(() => ({}));
      showNotification(`Upload failed: ${err.error || res.statusText}`, 'error');
    }
  } catch (err) {
    showNotification(`Backend error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Upload to Server';
  }
});

document.getElementById('btn-clear-history')?.addEventListener('click', () => {
  const btn = document.getElementById('btn-clear-history');
  if (btn.dataset.confirming === 'true') {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ veratrace_history: [] }, renderHistory);
    } else {
      localStorage.removeItem('veratrace_history');
      renderHistory();
    }
    btn.dataset.confirming = 'false';
    btn.textContent = 'Clear';
    showNotification('Local capture queue cleared.', 'info');
    const detailEl = document.getElementById('vault-item-detail');
    if (detailEl) detailEl.style.display = 'none';
  } else {
    btn.dataset.confirming = 'true';
    btn.textContent = 'Confirm?';
    setTimeout(() => {
      btn.dataset.confirming = 'false';
      btn.textContent = 'Clear';
    }, 4000);
  }
});

// Kick off initialization
async function init() {
  await initActiveTab();
  const apiBase = await getApiBase();
  const urlInput = document.getElementById('api-url-input');
  if (urlInput) urlInput.value = apiBase;
}
init();
