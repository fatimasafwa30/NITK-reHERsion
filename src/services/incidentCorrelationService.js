/**
 * VeraTrace — Cross-Platform Incident Correlation Engine
 *
 * Correlates evidence files, timeline events, accounts, and identifiers across platforms
 * (WhatsApp, Instagram, Email, Telegram, SMS, Phone/Calls, Facebook, etc.).
 *
 * EPISTEMIC MANDATE:
 * Shared handles, phone numbers, or repeated phrases are treated as INVESTIGATIVE CLUES,
 * NOT conclusive proof that accounts belong to the same individual.
 */

import { detectPlatform, KNOWN_PLATFORMS } from './patternAnalysisService';

export const LINK_CONFIDENCE = Object.freeze({
  FACTUAL_OBSERVATION: 'FACTUAL_OBSERVATION',   // Directly captured in evidence metadata/screenshot
  STRONG_IDENTIFIER_MATCH: 'STRONG_IDENTIFIER_MATCH', // Exact phone number or email address match
  PROBABLE_CLUE: 'PROBABLE_CLUE',               // Distinctive handle root or identical phrase match
  POSSIBLE_COINCIDENCE: 'POSSIBLE_COINCIDENCE', // Generic handle match or soft temporal proximity
  BEHAVIORAL_BYPASS: 'BEHAVIORAL_BYPASS',       // Migration to new channel after block
});

/**
 * Normalizes handles, phone numbers, or emails for matching.
 */
export function normalizeIdentifier(val = '') {
  if (!val || typeof val !== 'string') return '';
  return val.trim().toLowerCase().replace(/^[@+]/, '').replace(/\s+/g, '');
}

/**
 * Extracts potential shared identifiers (phones, emails, handles, hashtags) from text.
 */
export function extractIdentifiersFromText(text = '') {
  if (!text || typeof text !== 'string') return [];
  const found = new Set();

  // Email pattern
  const emails = text.match(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g) || [];
  emails.forEach((e) => found.add(e.toLowerCase()));

  // Phone pattern (international or 10-digit)
  const phones = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,4}\)?[-.\s]?\d{3}[-.\s]?\d{3,4}/g) || [];
  phones.forEach((p) => {
    const clean = p.replace(/\D/g, '');
    if (clean.length >= 7 && clean.length <= 15) {
      found.add(p.trim());
    }
  });

  // Handle pattern (@username)
  const handles = text.match(/@[a-zA-Z0-9_.-]{3,30}/g) || [];
  handles.forEach((h) => found.add(h.toLowerCase()));

  return Array.from(found);
}

/**
 * Analyzes case evidence and timeline events to correlate cross-platform touchpoints.
 *
 * @param {Array<object>} evidenceList
 * @param {Array<object>} timelineList
 * @returns {object} Correlated Incidents & Relationship Graph
 */
export function correlateCrossPlatformIncidents(evidenceList = [], timelineList = []) {
  const evidence = [...evidenceList];
  const timeline = [...timelineList];

  // 1. Gather all entity touchpoints
  const accountsMap = new Map(); // handle/sender -> account object
  const identifiersMap = new Map(); // identifier -> list of source items
  const platformsMap = new Map(); // platformId -> count

  // Helper to register an account
  const registerAccount = (handle, platform, sourceItem, isBlockedPrior = false) => {
    if (!handle || typeof handle !== 'string') return null;
    const cleanHandle = handle.trim();
    if (!cleanHandle) return null;
    const key = `${platform.id}::${cleanHandle.toLowerCase()}`;

    let acc = accountsMap.get(key);
    if (!acc) {
      acc = {
        id: `acc_${accountsMap.size + 1}`,
        key,
        handle: cleanHandle,
        platform,
        sources: [],
        blockedPrior: isBlockedPrior,
        firstSeen: sourceItem.recordedAt || sourceItem.occurredAt || null,
        lastSeen: sourceItem.recordedAt || sourceItem.occurredAt || null,
      };
      accountsMap.set(key, acc);
    }
    acc.sources.push(sourceItem);
    if (isBlockedPrior) acc.blockedPrior = true;

    // Track platform count
    const pCount = platformsMap.get(platform.id) || { platform, count: 0 };
    pCount.count += 1;
    platformsMap.set(platform.id, pCount);

    return acc;
  };

  // Helper to register a shared identifier
  const registerIdentifier = (rawIdent, category, sourceItem, confidence = LINK_CONFIDENCE.PROBABLE_CLUE) => {
    if (!rawIdent) return;
    const clean = String(rawIdent).trim();
    if (!clean || clean.length < 3) return;
    const norm = normalizeIdentifier(clean);

    let identObj = identifiersMap.get(norm);
    if (!identObj) {
      identObj = {
        id: `ident_${identifiersMap.size + 1}`,
        raw: clean,
        normalized: norm,
        category, // 'PHONE' | 'EMAIL' | 'HANDLE' | 'PHRASE'
        confidence,
        linkedItems: [],
        platforms: new Set(),
      };
      identifiersMap.set(norm, identObj);
    }
    identObj.linkedItems.push(sourceItem);
    if (sourceItem.platform) {
      identObj.platforms.add(sourceItem.platform.id);
    }
  };

  // Process evidence items
  for (const item of evidence) {
    const rawHint = `${item.userClaimedSource || ''} ${item.platform || ''} ${item.fileName || ''}`;
    const platform = detectPlatform(rawHint);
    const enrichedItem = { ...item, platform, entityType: 'EVIDENCE' };

    // Sender handle
    if (item.senderHandle) {
      registerAccount(item.senderHandle, platform, enrichedItem, Boolean(item.blockedPrior));
    }

    // Explicit shared identifiers
    if (Array.isArray(item.sharedIdentifiers)) {
      for (const idf of item.sharedIdentifiers) {
        let cat = 'HANDLE';
        if (idf.includes('@') && idf.includes('.')) cat = 'EMAIL';
        else if (/\d{7,}/.test(idf)) cat = 'PHONE';
        else if (idf.includes('_') || idf.includes(' ')) cat = 'PHRASE';
        registerIdentifier(idf, cat, enrichedItem, LINK_CONFIDENCE.STRONG_IDENTIFIER_MATCH);
      }
    }

    // Auto-extract identifiers from notes or text
    const textClues = `${item.notes || ''} ${item.extractedText || ''} ${item.fileName || ''}`;
    const autoExtracted = extractIdentifiersFromText(textClues);
    for (const autoId of autoExtracted) {
      let cat = 'HANDLE';
      if (autoId.includes('@') && autoId.includes('.')) cat = 'EMAIL';
      else if (/\d{7,}/.test(autoId)) cat = 'PHONE';
      registerIdentifier(autoId, cat, enrichedItem, LINK_CONFIDENCE.PROBABLE_CLUE);
    }
  }

  // Process timeline events
  for (const event of timeline) {
    const rawHint = `${event.platform || ''} ${event.label || ''}`;
    const platform = detectPlatform(rawHint);
    const enrichedEvent = { ...event, platform, entityType: 'TIMELINE_EVENT' };

    if (event.senderHandle) {
      registerAccount(event.senderHandle, platform, enrichedEvent, Boolean(event.blockedPrior));
    }

    const autoExtracted = extractIdentifiersFromText(event.label);
    for (const autoId of autoExtracted) {
      let cat = 'HANDLE';
      if (autoId.includes('@') && autoId.includes('.')) cat = 'EMAIL';
      else if (/\d{7,}/.test(autoId)) cat = 'PHONE';
      registerIdentifier(autoId, cat, enrichedEvent, LINK_CONFIDENCE.PROBABLE_CLUE);
    }
  }

  const accounts = Array.from(accountsMap.values());
  const allIdentifiers = Array.from(identifiersMap.values()).map((idf) => ({
    ...idf,
    platforms: Array.from(idf.platforms),
    crossPlatform: idf.platforms.size >= 2,
  }));

  // Cross-platform shared identifiers (observed across 2+ platforms)
  const crossPlatformIdentifiers = allIdentifiers.filter((idf) => idf.crossPlatform);

  // 2. Build Interactive Relationship Graph Nodes & Edges
  const nodes = [];
  const links = [];
  const nodeIds = new Set();

  const addNode = (node) => {
    if (!nodeIds.has(node.id)) {
      nodeIds.add(node.id);
      nodes.push(node);
    }
  };

  // Add Platform Nodes
  for (const { platform, count } of platformsMap.values()) {
    addNode({
      id: `plat_${platform.id}`,
      name: platform.label,
      type: 'PLATFORM',
      color: platform.color,
      badgeClass: platform.badgeClass,
      count,
      size: 28 + Math.min(count * 6, 24),
    });
  }

  // Add Account / Handle Nodes
  for (const acc of accounts) {
    addNode({
      id: acc.id,
      name: acc.handle,
      type: 'ACCOUNT',
      platform: acc.platform.label,
      platformId: acc.platform.id,
      blockedPrior: acc.blockedPrior,
      size: 22,
    });

    // Link Account -> Platform
    links.push({
      source: acc.id,
      target: `plat_${acc.platform.id}`,
      type: 'OBSERVED_ON',
      label: 'Observed on',
      confidence: LINK_CONFIDENCE.FACTUAL_OBSERVATION,
    });
  }

  // Add Cross-Platform Identifier Nodes
  for (const idf of crossPlatformIdentifiers) {
    addNode({
      id: idf.id,
      name: idf.raw,
      type: 'IDENTIFIER',
      category: idf.category,
      confidence: idf.confidence,
      size: 20,
    });

    // Link Identifier -> Accounts / Sources that match it
    for (const acc of accounts) {
      const match =
        acc.handle.toLowerCase().includes(idf.normalized) ||
        idf.linkedItems.some((item) => item.senderHandle === acc.handle);

      if (match) {
        links.push({
          source: acc.id,
          target: idf.id,
          type: 'SHARED_IDENTIFIER',
          label: `Matches ${idf.category}`,
          confidence: idf.confidence,
        });
      }
    }
  }

  // Add Evidence File Nodes
  for (const ev of evidence) {
    const rawHint = `${ev.userClaimedSource || ''} ${ev.fileName || ''}`;
    const plat = detectPlatform(rawHint);
    addNode({
      id: ev.evidenceId,
      name: ev.fileName,
      type: 'EVIDENCE',
      platform: plat.label,
      platformId: plat.id,
      sha256: ev.sha256,
      size: 22,
    });

    // Link Evidence -> Account if senderHandle matches
    if (ev.senderHandle) {
      const acc = accounts.find((a) => a.handle.toLowerCase() === ev.senderHandle.trim().toLowerCase());
      if (acc) {
        links.push({
          source: ev.evidenceId,
          target: acc.id,
          type: 'EVIDENCE_SOURCE',
          label: 'Captured contact',
          confidence: LINK_CONFIDENCE.FACTUAL_OBSERVATION,
        });
      }
    }
    // Also link Evidence -> Platform
    links.push({
      source: ev.evidenceId,
      target: `plat_${plat.id}`,
      type: 'SEALED_ON_PLATFORM',
      label: 'Sealed on platform',
      confidence: LINK_CONFIDENCE.FACTUAL_OBSERVATION,
    });

    // Link Evidence -> Shared Identifiers
    for (const idf of crossPlatformIdentifiers) {
      const match =
        (ev.sharedIdentifiers && ev.sharedIdentifiers.some((sid) => normalizeIdentifier(sid) === idf.normalized)) ||
        (ev.notes && ev.notes.toLowerCase().includes(idf.normalized)) ||
        (ev.fileName && ev.fileName.toLowerCase().includes(idf.normalized));
      if (match) {
        links.push({
          source: ev.evidenceId,
          target: idf.id,
          type: 'CONTAINS_IDENTIFIER',
          label: `Contains ${idf.category}`,
          confidence: idf.confidence,
        });
      }
    }
  }

  // Add Incident / Timeline Nodes
  for (const tl of timeline) {
    const rawHint = `${tl.platform || ''} ${tl.label || ''}`;
    const plat = detectPlatform(rawHint);
    addNode({
      id: tl.eventId,
      name: tl.label.length > 24 ? `${tl.label.slice(0, 22)}…` : tl.label,
      fullLabel: tl.label,
      type: 'INCIDENT',
      platform: plat.label,
      platformId: plat.id,
      timeConfidence: tl.timeConfidence,
      blockedPrior: Boolean(tl.blockedPrior),
      size: 20,
    });

    // Link Incident -> Platform
    links.push({
      source: tl.eventId,
      target: `plat_${plat.id}`,
      type: 'OCCURRED_ON',
      label: 'Occurred on',
      confidence: tl.timeConfidence === 'confirmed' ? LINK_CONFIDENCE.FACTUAL_OBSERVATION : LINK_CONFIDENCE.PROBABLE_CLUE,
    });

    // Link Incident -> Related Evidence if specified
    if (tl.relatedEvidenceId && nodeIds.has(tl.relatedEvidenceId)) {
      links.push({
        source: tl.eventId,
        target: tl.relatedEvidenceId,
        type: 'SUPPORTING_EVIDENCE',
        label: 'Preserved by',
        confidence: LINK_CONFIDENCE.FACTUAL_OBSERVATION,
      });
    }

    // Link Incident -> Account if senderHandle matches
    if (tl.senderHandle) {
      const acc = accounts.find((a) => a.handle.toLowerCase() === tl.senderHandle.trim().toLowerCase());
      if (acc) {
        links.push({
          source: tl.eventId,
          target: acc.id,
          type: 'INCIDENT_SENDER',
          label: 'Sender involved',
          confidence: LINK_CONFIDENCE.FACTUAL_OBSERVATION,
        });
      }
    }
  }

  // Link Accounts where Contact was resumed after blocking
  const bypassAccounts = accounts.filter((a) => a.blockedPrior);
  for (const bAcc of bypassAccounts) {
    // Connect to other earlier accounts as a suspected bypass migration
    const earlierAccounts = accounts.filter((a) => a.id !== bAcc.id && !a.blockedPrior);
    for (const eAcc of earlierAccounts) {
      links.push({
        source: bAcc.id,
        target: eAcc.id,
        type: 'CONTACT_AFTER_BLOCK',
        label: 'Contact resumed after block',
        confidence: LINK_CONFIDENCE.BEHAVIORAL_BYPASS,
      });
    }
  }

  // 3. Chronological Correlation Matrix / Events
  const correlatedChronology = [];
  for (const ev of evidence) {
    const rawHint = `${ev.userClaimedSource || ''} ${ev.fileName || ''}`;
    const plat = detectPlatform(rawHint);
    correlatedChronology.push({
      id: ev.evidenceId,
      type: 'EVIDENCE',
      title: ev.fileName,
      platform: plat,
      senderHandle: ev.senderHandle || 'Not recorded',
      notes: ev.notes || ev.userClaimedSource || 'Evidence file sealed',
      timestamp: ev.recordedAt,
      sha256: ev.sha256,
      blockedPrior: Boolean(ev.blockedPrior),
      verificationStatus: ev.verificationStatus,
    });
  }

  for (const tl of timeline) {
    const rawHint = `${tl.platform || ''} ${tl.label || ''}`;
    const plat = detectPlatform(rawHint);
    correlatedChronology.push({
      id: tl.eventId,
      type: 'TIMELINE_EVENT',
      title: tl.label,
      platform: plat,
      senderHandle: tl.senderHandle || 'Not recorded',
      notes: tl.label,
      timestamp: tl.occurredAt,
      timeConfidence: tl.timeConfidence,
      blockedPrior: Boolean(tl.blockedPrior),
      relatedEvidenceId: tl.relatedEvidenceId,
    });
  }

  // Sort chronological events (nulls last)
  correlatedChronology.sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });

  return {
    accounts,
    allIdentifiers,
    crossPlatformIdentifiers,
    platformsCount: platformsMap.size,
    graph: { nodes, links },
    chronology: correlatedChronology,
    epistemicNotice:
      'Shared handles, phone numbers, or phrases are presented as investigative clues, not definitive legal proof of single-person authorship. Cross-referencing establishes correlation, while final attribution requires lawful service-provider verification.',
  };
}
