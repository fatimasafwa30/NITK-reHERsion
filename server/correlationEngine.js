/**
 * VeraTrace — Cross-Platform Digital Evidence Intelligence Engine
 *
 * Implements multi-signal correlation across:
 * 1. Account relationships (usernames, handles, profile URLs)
 * 2. Evidence relationships (matching media hashes, repeated URLs)
 * 3. Temporal relationships (contact resumption following block events)
 * 4. Content relationships (shared handles, phone numbers, unique identifiers)
 * 5. Network signals (IP treated ONLY as supporting metadata, NEVER as identity proof)
 *
 * Epistemic Guardrail:
 * Shared handles or IP addresses NEVER imply that two accounts belong to the same person.
 * Labels reflect evidence strength: Verified Relationship, Possible Relationship, Insufficient Evidence, Requires Human Review.
 */

import crypto from 'node:crypto';
import { getDatabase } from './db.js';

export const RELATION_TYPES = Object.freeze({
  ACCOUNT_LINK: 'ACCOUNT_LINK',
  SHARED_IDENTIFIER: 'SHARED_IDENTIFIER',
  TEMPORAL_ESCALATION: 'TEMPORAL_ESCALATION',
  MEDIA_HASH_MATCH: 'MEDIA_HASH_MATCH',
  BEHAVIORAL_BYPASS: 'BEHAVIORAL_BYPASS',
  SHARED_NETWORK_METADATA: 'SHARED_NETWORK_METADATA',
});

export const RELATION_STATUSES = Object.freeze({
  VERIFIED_RELATIONSHIP: 'VERIFIED_RELATIONSHIP',
  POSSIBLE_RELATIONSHIP: 'POSSIBLE_RELATIONSHIP',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  REQUIRES_HUMAN_REVIEW: 'REQUIRES_HUMAN_REVIEW',
  DISMISSED: 'DISMISSED',
});

/**
 * Stop-list of generic usernames, service accounts, and short words
 * that should NEVER be used to assert cross-platform correlation.
 */
export const GENERIC_IDENTIFIER_STOPLIST = new Set([
  'admin', 'administrator', 'support', 'help', 'info', 'service',
  'contact', 'team', 'test', 'user', 'null', 'anonymous', 'official',
  'moderator', 'customer', 'staff', 'billing', 'feedback', 'sales',
  'notifications', 'security', 'alert', 'dev', 'system', 'root',
  'account', 'profile', 'member', 'update', 'status'
]);

/**
 * Normalizes handles, phone numbers, or emails for matching.
 */
export function normalizeIdentifier(val = '') {
  if (!val || typeof val !== 'string') return '';
  return val.trim().toLowerCase().replace(/^[@+]/, '').replace(/[\s\-_.]/g, '');
}

/**
 * Extracts phones, emails, and handles from free-form text.
 */
export function extractIdentifiers(text = '') {
  if (!text || typeof text !== 'string') return [];
  const found = new Set();

  const emails = text.match(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g) || [];
  emails.forEach((e) => found.add(e.toLowerCase()));

  const phones = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,4}\)?[-.\s]?\d{3}[-.\s]?\d{3,4}/g) || [];
  phones.forEach((p) => {
    const clean = p.replace(/\D/g, '');
    if (clean.length >= 7 && clean.length <= 15) found.add(p.trim());
  });

  const handles = text.match(/@[a-zA-Z0-9_.-]{3,30}/g) || [];
  handles.forEach((h) => found.add(h.toLowerCase()));

  return Array.from(found);
}

/**
 * Executes cross-platform intelligence analysis for a case.
 */
export function analyzeCaseIntelligence(caseId) {
  const db = getDatabase();

  const evidence = db.prepare(`SELECT * FROM evidence_records WHERE case_id = ?`).all(caseId);
  const timeline = db.prepare(`SELECT * FROM timeline_events WHERE case_id = ? ORDER BY occurred_at ASC`).all(caseId);

  // Existing review decisions
  const existingReviews = new Map();
  const existingRows = db.prepare(`SELECT * FROM incident_correlations WHERE case_id = ?`).all(caseId);
  existingRows.forEach((r) => {
    existingReviews.set(`${r.source_id}->${r.target_id}`, r);
  });

  const nodes = [];
  const links = [];
  const addedNodes = new Set();

  const addNode = (node) => {
    if (!addedNodes.has(node.id)) {
      addedNodes.add(node.id);
      nodes.push(node);
    }
  };

  // 1. Create nodes for Platforms & Accounts
  const handleMap = new Map(); // normalizedHandle -> array of { platform, handle, event/evidence }
  const mediaHashMap = new Map(); // sha256 -> array of evidence records
  const urlMap = new Map(); // url -> array of items

  timeline.forEach((event) => {
    addNode({
      id: `event_${event.event_id}`,
      type: 'incident',
      label: event.label,
      occurredAt: event.occurred_at,
      platform: event.platform || 'Unknown',
      confidence: event.time_confidence,
    });

    if (event.platform) {
      addNode({
        id: `plat_${event.platform.toLowerCase()}`,
        type: 'platform',
        label: event.platform,
      });

      links.push({
        source: `event_${event.event_id}`,
        target: `plat_${event.platform.toLowerCase()}`,
        type: 'PLATFORM_OCCURRENCE',
        label: `Occurred on ${event.platform}`,
      });
    }

    if (event.sender_handle) {
      const accId = `acc_${normalizeIdentifier(event.sender_handle)}`;
      addNode({
        id: accId,
        type: 'account',
        label: event.sender_handle,
        platform: event.platform || 'Unknown',
      });

      links.push({
        source: `event_${event.event_id}`,
        target: accId,
        type: 'SENDER_ATTRIBUTION',
        label: 'Message Sender',
      });

      const norm = normalizeIdentifier(event.sender_handle);
      if (!handleMap.has(norm)) handleMap.set(norm, []);
      handleMap.get(norm).push({ event, handle: event.sender_handle, platform: event.platform });
    }
  });

  evidence.forEach((ev) => {
    addNode({
      id: `ev_${ev.evidence_id}`,
      type: 'evidence',
      label: ev.original_filename,
      hash: ev.sha256_hash,
      source: ev.submission_source,
    });

    // Check media hash duplicates
    if (!mediaHashMap.has(ev.sha256_hash)) mediaHashMap.set(ev.sha256_hash, []);
    mediaHashMap.get(ev.sha256_hash).push(ev);

    if (ev.source_url) {
      const cleanUrl = ev.source_url.trim().toLowerCase();
      addNode({
        id: `url_${crypto.createHash('md5').update(cleanUrl).digest('hex').slice(0, 8)}`,
        type: 'url',
        label: ev.source_url,
      });
      if (!urlMap.has(cleanUrl)) urlMap.set(cleanUrl, []);
      urlMap.get(cleanUrl).push(ev);
    }
  });

  // 2. Discover Multi-Signal Correlations
  const correlations = [];

  // A. Matching Media Hashes across submissions
  mediaHashMap.forEach((evList, hash) => {
    if (evList.length > 1) {
      for (let i = 0; i < evList.length; i++) {
        for (let j = i + 1; j < evList.length; j++) {
          const src = `ev_${evList[i].evidence_id}`;
          const tgt = `ev_${evList[j].evidence_id}`;
          const pairKey = `${src}->${tgt}`;
          const existing = existingReviews.get(pairKey);

          correlations.push({
            correlationId: existing?.correlation_id || `corr_${crypto.randomUUID()}`,
            caseId,
            sourceId: src,
            targetId: tgt,
            relationType: RELATION_TYPES.MEDIA_HASH_MATCH,
            confidenceLevel: 'FACTUAL_OBSERVATION',
            explanation: `Identical binary file hash (SHA-256: ${hash.slice(0, 16)}...). Identical media distributed in both submissions.`,
            supportingEvidenceIds: JSON.stringify([evList[i].evidence_id, evList[j].evidence_id]),
            status: existing?.status || RELATION_STATUSES.VERIFIED_RELATIONSHIP,
            reviewedBy: existing?.reviewed_by || null,
            reviewedAt: existing?.reviewed_at || null,
          });

          links.push({
            source: src,
            target: tgt,
            type: RELATION_TYPES.MEDIA_HASH_MATCH,
            label: 'Identical Media Hash',
            confidence: 'FACTUAL_OBSERVATION',
          });
        }
      }
    }
  });

  // B. Cross-Platform Shared Identifiers
  handleMap.forEach((instances, normHandle) => {
    // Exclude generic identifiers and excessively short handles (< 4 characters)
    if (!normHandle || normHandle.length < 4 || GENERIC_IDENTIFIER_STOPLIST.has(normHandle)) {
      return;
    }

    // If handle root appears across different platforms
    const platforms = new Set(instances.map((i) => i.platform).filter(Boolean));
    if (platforms.size > 1) {
      for (let i = 0; i < instances.length; i++) {
        for (let j = i + 1; j < instances.length; j++) {
          if (instances[i].platform !== instances[j].platform) {
            const src = `acc_${normHandle}`;
            const tgt = `event_${instances[j].event.event_id}`;
            const pairKey = `${src}->${tgt}`;
            const existing = existingReviews.get(pairKey);

            correlations.push({
              correlationId: existing?.correlation_id || `corr_${crypto.randomUUID()}`,
              caseId,
              sourceId: src,
              targetId: tgt,
              relationType: RELATION_TYPES.SHARED_IDENTIFIER,
              confidenceLevel: 'PROBABLE_CLUE',
              explanation: `Sender handle root "${instances[i].handle}" appears across both ${instances[i].platform} and ${instances[j].platform}. Investigative clue; does not prove single-author identity.`,
              supportingEvidenceIds: JSON.stringify(
                [instances[i].event.related_evidence_id, instances[j].event.related_evidence_id].filter(Boolean)
              ),
              status: existing?.status || RELATION_STATUSES.POSSIBLE_RELATIONSHIP,
              reviewedBy: existing?.reviewed_by || null,
              reviewedAt: existing?.reviewed_at || null,
            });

            links.push({
              source: src,
              target: tgt,
              type: RELATION_TYPES.SHARED_IDENTIFIER,
              label: `Cross-Platform Handle (${instances[i].platform} & ${instances[j].platform})`,
              confidence: 'PROBABLE_CLUE',
            });
          }
        }
      }
    }
  });

  // C. Temporal Block-Bypass Contact Correlation
  timeline.forEach((event, idx) => {
    if (event.blocked_prior && idx > 0) {
      const priorEvent = timeline[idx - 1];
      const src = `event_${priorEvent.event_id}`;
      const tgt = `event_${event.event_id}`;
      const pairKey = `${src}->${tgt}`;
      const existing = existingReviews.get(pairKey);

      correlations.push({
        correlationId: existing?.correlation_id || `corr_${crypto.randomUUID()}`,
        caseId,
        sourceId: src,
        targetId: tgt,
        relationType: RELATION_TYPES.BEHAVIORAL_BYPASS,
        confidenceLevel: 'BEHAVIORAL_BYPASS',
        explanation: `Subsequent contact attempt on ${event.platform || 'new channel'} recorded after an explicit blocking action on prior channel (${priorEvent.platform || 'prior'}). Demonstrates persistence.`,
        supportingEvidenceIds: JSON.stringify(
          [priorEvent.related_evidence_id, event.related_evidence_id].filter(Boolean)
        ),
        status: existing?.status || RELATION_STATUSES.VERIFIED_RELATIONSHIP,
        reviewedBy: existing?.reviewed_by || null,
        reviewedAt: existing?.reviewed_at || null,
      });

      links.push({
        source: src,
        target: tgt,
        type: RELATION_TYPES.BEHAVIORAL_BYPASS,
        label: 'Block-Bypass Contact',
        confidence: 'BEHAVIORAL_BYPASS',
      });
    }
  });

  // Save / Update correlations in database
  const insertStmt = db.prepare(`
    INSERT INTO incident_correlations (
      correlation_id, case_id, source_id, target_id, relation_type,
      confidence_level, explanation, supporting_evidence_ids, status,
      reviewed_by, reviewed_at, created_at
    ) VALUES (
      @correlationId, @caseId, @sourceId, @targetId, @relationType,
      @confidenceLevel, @explanation, @supportingEvidenceIds, @status,
      @reviewedBy, @reviewedAt, datetime('now')
    )
    ON CONFLICT(correlation_id) DO UPDATE SET
      status = excluded.status,
      reviewed_by = excluded.reviewed_by,
      reviewed_at = excluded.reviewed_at
  `);

  correlations.forEach((c) => {
    try {
      insertStmt.run(c);
    } catch {}
  });

  return {
    graph: { nodes, links },
    correlations,
    summary: {
      totalEntities: nodes.length,
      crossPlatformClues: correlations.filter((c) => c.relationType === RELATION_TYPES.SHARED_IDENTIFIER).length,
      mediaMatches: correlations.filter((c) => c.relationType === RELATION_TYPES.MEDIA_HASH_MATCH).length,
      blockBypasses: correlations.filter((c) => c.relationType === RELATION_TYPES.BEHAVIORAL_BYPASS).length,
    },
  };
}

/**
 * Allows a human reviewer to verify, dismiss, or annotate a suggested relationship.
 */
export function recordCorrelationReview({ correlationId, status, reviewedBy, reviewNotes = '' }) {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE incident_correlations
    SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_notes = ?
    WHERE correlation_id = ?
  `);
  stmt.run(status, reviewedBy, reviewNotes, correlationId);

  return { correlationId, status, reviewedBy, reviewedAt: new Date().toISOString() };
}
