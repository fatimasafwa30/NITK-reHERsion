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

const API_BASE = 'http://localhost:4000/api';

let currentCapture = null;
let activeTab = null;

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

// Fetch active cases from VeraTrace API
async function fetchCases() {
  const select = document.getElementById('case-select');
  try {
    const res = await fetch(`${API_BASE}/cases`);
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
        document.getElementById('conn-badge').textContent = 'Vault Connected';
        document.getElementById('conn-badge').style.backgroundColor = '#ECFDF5';
        document.getElementById('conn-badge').style.color = '#065F46';
        return;
      }
    }
  } catch (err) {
    // Backend offline / standalone mode
    document.getElementById('conn-badge').textContent = 'Offline Vault';
  }
}

// 1. Capture Visible Tab Action
document.getElementById('btn-capture-tab')?.addEventListener('click', async () => {
  const statusEl = document.getElementById('capture-status');
  statusEl.textContent = 'Capturing tab and computing SHA-256...';
  statusEl.className = 'status-msg';

  try {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.captureVisibleTab) {
      throw new Error('Chrome extension tabs API is not available in standalone preview.');
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    const blob = dataUrlToBlob(dataUrl);
    const arrayBuffer = await blob.arrayBuffer();
    const sha256 = await computeSha256(arrayBuffer);

    currentCapture = {
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

// Inline Notification System (Replaces disruptive window.alert/confirm)
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

// 2. Upload to VeraTrace API
document.getElementById('evidence-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentCapture) return;

  const btnUpload = document.getElementById('btn-upload');
  btnUpload.disabled = true;
  btnUpload.textContent = 'Sealing in Vault...';

  const caseId = document.getElementById('case-select').value;
  const platform = document.getElementById('evidence-platform').value;
  const senderHandle = document.getElementById('sender-handle').value;
  const notes = document.getElementById('context-notes').value;

  const formData = new FormData();
  formData.append('file', currentCapture.blob, `capture_${Date.now()}.png`);
  formData.append('submissionSource', 'EXTENSION_CAPTURE');
  formData.append('submissionMethod', 'CHROME_EXT_MV3');
  formData.append('captureTimestamp', currentCapture.captureTimestamp);
  formData.append('sourceUrl', currentCapture.url);
  formData.append('platform', platform);
  formData.append('senderHandle', senderHandle);
  formData.append('notes', notes);

  try {
    const res = await fetch(`${API_BASE}/cases/${caseId}/evidence`, {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      saveToLocalHistory({
        evidenceId: data.evidence.evidence_id,
        filename: data.evidence.original_filename,
        sha256: currentCapture.sha256,
        url: currentCapture.url,
        caseId,
        uploadedAt: new Date().toISOString(),
        status: 'SEALED_IN_VAULT',
      });

      showNotification(`Evidence sealed in Vault! Evidence ID: ${data.evidence.evidence_id} (SHA-256: ${currentCapture.sha256.slice(0, 16)}...)`, 'success', 6000);

      currentCapture = null;
      document.getElementById('no-capture-placeholder').style.display = 'block';
      document.getElementById('review-content').style.display = 'none';
      document.querySelector('[data-tab="tab-history"]').click();
    } else {
      throw new Error(`Server returned HTTP ${res.status}`);
    }
  } catch (err) {
    // Offline resilience: save in local queue with base64 dataUrl so evidence is never lost and can be retried
    const offlineId = `offline_${Date.now()}`;
    saveToLocalHistory({
      evidenceId: offlineId,
      filename: `capture_${Date.now()}.png`,
      sha256: currentCapture.sha256,
      url: currentCapture.url,
      caseId,
      platform,
      senderHandle,
      notes,
      captureTimestamp: currentCapture.captureTimestamp,
      dataUrl: currentCapture.dataUrl, // Preserved for retry transmission
      uploadedAt: new Date().toISOString(),
      status: 'SAVED_LOCALLY_PENDING_SYNC',
    });

    showNotification(`VeraTrace local server unreachable. Capture queued safely in offline local storage!`, 'info', 6000);
    currentCapture = null;
    document.getElementById('no-capture-placeholder').style.display = 'block';
    document.getElementById('review-content').style.display = 'none';
    document.querySelector('[data-tab="tab-history"]').click();
  } finally {
    btnUpload.disabled = false;
    btnUpload.textContent = 'Upload to Vault';
  }
});

// Offline Queue Synchronizer & Retry Engine
async function syncPendingCaptures() {
  const syncBtn = document.getElementById('btn-sync-pending');
  const statusEl = document.getElementById('sync-status');
  if (syncBtn) syncBtn.disabled = true;

  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.textContent = 'Checking pending queue for retries...';
  }

  const getItems = () =>
    new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['veratrace_history'], (res) => resolve(res.veratrace_history || []));
      } else {
        resolve(JSON.parse(localStorage.getItem('veratrace_history') || '[]'));
      }
    });

  const saveItems = (items) =>
    new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ veratrace_history: items }, resolve);
      } else {
        localStorage.setItem('veratrace_history', JSON.stringify(items));
        resolve();
      }
    });

  const history = await getItems();
  const pending = history.filter((item) => item.status === 'SAVED_LOCALLY_PENDING_SYNC' && item.dataUrl && !item.in_flight);

  if (pending.length === 0) {
    if (statusEl) statusEl.textContent = 'No offline captures pending synchronization.';
    if (syncBtn) syncBtn.disabled = false;
    setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 3000);
    return;
  }

  let syncedCount = 0;
  for (const item of pending) {
    item.in_flight = true;
    try {
      const blob = dataUrlToBlob(item.dataUrl);
      const formData = new FormData();
      formData.append('file', blob, item.filename);
      formData.append('submissionSource', 'EXTENSION_CAPTURE');
      formData.append('submissionMethod', 'CHROME_EXT_MV3_OFFLINE_RETRY');
      formData.append('captureTimestamp', item.captureTimestamp || item.uploadedAt);
      formData.append('sourceUrl', item.url || '');
      formData.append('platform', item.platform || 'Other');
      formData.append('senderHandle', item.senderHandle || '');
      formData.append('notes', item.notes || 'Synced from offline queue');

      const res = await fetch(`${API_BASE}/cases/${item.caseId || 'VT-DEMO-2026'}/evidence`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        item.status = 'SEALED_IN_VAULT';
        item.evidenceId = data.evidence?.evidence_id || item.evidenceId;
        delete item.dataUrl; // Free storage memory once safely ingested
        item.syncedAt = new Date().toISOString();
        syncedCount++;
      }
    } catch (err) {
      // Server still offline; keep in queue for next retry
    } finally {
      delete item.in_flight;
    }
  }

  await saveItems(history);
  renderHistory();

  if (statusEl) {
    if (syncedCount > 0) {
      statusEl.textContent = `Successfully synchronized ${syncedCount} offline capture(s) to vault!`;
      showNotification(`Synchronized ${syncedCount} offline capture(s) to VeraTrace!`, 'success');
    } else {
      statusEl.textContent = `VeraTrace server still offline. Captures remain securely stored locally.`;
    }
  }

  if (syncBtn) syncBtn.disabled = false;
  setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 4000);
}

document.getElementById('btn-sync-pending')?.addEventListener('click', syncPendingCaptures);

// History Management (chrome.storage.local)
function saveToLocalHistory(entry) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['veratrace_history'], (res) => {
      const history = res.veratrace_history || [];
      history.unshift(entry);
      chrome.storage.local.set({ veratrace_history: history.slice(0, 50) }, renderHistory);
    });
  } else {
    // LocalStorage fallback for preview
    const hist = JSON.parse(localStorage.getItem('veratrace_history') || '[]');
    hist.unshift(entry);
    localStorage.setItem('veratrace_history', JSON.stringify(hist.slice(0, 50)));
    renderHistory();
  }
}

function renderHistory() {
  const container = document.getElementById('history-list');
  if (!container) return;

  const displayList = (items) => {
    if (!items || items.length === 0) {
      container.innerHTML = '<p class="text-muted text-xs">No captures in local history.</p>';
      return;
    }
    container.innerHTML = '';
    items.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'history-item';
      const isPending = item.status === 'SAVED_LOCALLY_PENDING_SYNC';
      el.innerHTML = `
        <span class="title">${item.filename}</span>
        <span class="text-xs text-muted mono">${item.sha256.slice(0, 24)}...</span>
        <div class="meta">
          <span style="color: ${isPending ? '#D97706' : '#059669'}; font-weight: 500;">
            ${isPending ? 'Queued (Offline)' : 'Sealed in Vault'}
          </span>
          <span>${new Date(item.uploadedAt).toLocaleTimeString()}</span>
        </div>
      `;
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
  } else {
    btn.dataset.confirming = 'true';
    btn.textContent = 'Confirm?';
    setTimeout(() => {
      btn.dataset.confirming = 'false';
      btn.textContent = 'Clear';
    }, 4000);
  }
});

// Kick off
initActiveTab();
