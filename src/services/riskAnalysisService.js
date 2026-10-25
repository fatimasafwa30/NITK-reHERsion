/**
 * VeraTrace — Early-Risk and Escalation Analysis Engine
 *
 * Deterministically analyzes user-provided evidence and timeline records for observable
 * behavioral indicators of harassment escalation, multi-channel boundary violations,
 * and coercive pressure.
 *
 * ETHICAL & LEGAL TRANSPARENCY:
 * - Does NOT assign a pseudo-scientific risk score.
 * - Does NOT pretend to predict human behavior or future violence.
 * - Clearly distinguishes factual observations from interpretive analysis.
 * - Never labels an individual guilty based on pattern similarity.
 */

import { detectPlatform } from './patternAnalysisService';
import { LINK_CONFIDENCE } from './incidentCorrelationService';

export const INDICATOR_SEVERITY = Object.freeze({
  HIGH: 'HIGH',       // Coercion, extortion, explicit harm threats, offline surveillance
  ELEVATED: 'ELEVATED', // Block bypass, cross-platform proliferation, rapid burst
  MONITOR: 'MONITOR',   // Unwanted repetitive contact, off-hours messaging
});

export const RISK_INDICATOR_DEFINITIONS = [
  {
    id: 'IND_BLOCK_BYPASS',
    name: 'Block Bypass & Secondary Channel Migration',
    severity: INDICATOR_SEVERITY.ELEVATED,
    description:
      'Contact continued or resumed from an alternate account, new phone number, or different platform after a prior channel was blocked or boundaries were stated.',
    keywords: ['blocked', 'block', 'new number', 'another account', 'alt account', 'unblock', 'ignoring me', 'bypass'],
    checkCondition: (item) => Boolean(item.blockedPrior) || (item.incidentType === 'BLOCK_BYPASS'),
  },
  {
    id: 'IND_COERCION_EXTORTION',
    name: 'Coercion, Blackmail or Extortion',
    severity: INDICATOR_SEVERITY.HIGH,
    description:
      'Demands coupled with threats of reputational ruin, non-consensual media distribution, career damage, or financial extortion.',
    keywords: ['ruin', 'expose', 'leak', 'share your', 'send to your', 'or else', 'regret', 'career', 'boss', 'photos', 'blackmail', 'extort'],
    checkCondition: (item) => item.incidentType === 'COERCION' || item.incidentType === 'EXTORTION',
  },
  {
    id: 'IND_OFFLINE_SURVEILLANCE',
    name: 'Offline Surveillance & Location Doxxing',
    severity: INDICATOR_SEVERITY.HIGH,
    description:
      'References to the victim’s physical workplace, commute route, residence, routine, or in-person proximity.',
    keywords: ['office', 'commute', 'saw you', 'outside', 'workplace', 'home', 'building', 'street', 'car', 'station', 'waiting for you', 'in person'],
    checkCondition: (item) => item.incidentType === 'OFFLINE_SURVEILLANCE',
  },
  {
    id: 'IND_EXPLICIT_THREATS',
    name: 'Explicit Threats of Physical Harm',
    severity: INDICATOR_SEVERITY.HIGH,
    description:
      'Direct statements conveying intent to inflict bodily injury, assault, or physical violence.',
    keywords: ['kill', 'hurt you', 'beat', 'assault', 'destroy you', 'physically', 'break', 'pay for this'],
    checkCondition: (item) => item.incidentType === 'PHYSICAL_THREAT',
  },
  {
    id: 'IND_CROSS_PLATFORM_PROLIFERATION',
    name: 'Cross-Platform Channel Proliferation',
    severity: INDICATOR_SEVERITY.ELEVATED,
    description:
      'Harassment spans two or more independent communication channels (e.g. WhatsApp, Email, Instagram, Phone Calls).',
    keywords: [],
    checkCondition: null, // Evaluated across the entire case
  },
  {
    id: 'IND_ACCELERATING_VELOCITY',
    name: 'High Frequency Clustering & Velocity Acceleration',
    severity: INDICATOR_SEVERITY.ELEVATED,
    description:
      'Incidents cluster within narrow time intervals (e.g. multiple events within 48 hours across platforms).',
    keywords: [],
    checkCondition: null, // Evaluated across timeline
  },
  {
    id: 'IND_NOCTURNAL_INTRUSION',
    name: 'Nocturnal / Off-Hours Boundary Violation',
    severity: INDICATOR_SEVERITY.MONITOR,
    description:
      'Repeated contact attempts between 10:00 PM and 6:00 AM, intruding on private rest hours.',
    keywords: [],
    checkCondition: null, // Evaluated via timestamp hour
  },
];

/**
 * Performs Early-Risk and Escalation Analysis over case evidence and timeline events.
 *
 * @param {object} caseRecord
 * @param {Array<object>} evidenceList
 * @param {Array<object>} timelineList
 * @returns {object} Comprehensive Risk and Escalation Assessment
 */
export function analyzeEscalationAndRisk(caseRecord, evidenceList = [], timelineList = []) {
  const evidence = [...evidenceList];
  const timeline = [...timelineList];

  const totalItems = evidence.length + timeline.length;

  // 1. Check for Insufficient Evidence
  if (totalItems < 2) {
    return {
      status: 'INSUFFICIENT_DATA',
      isSufficient: false,
      summary:
        'Insufficient evidence records to establish a cross-platform pattern or escalation trajectory. At least two verifiable evidence files or timeline events are required.',
      observedIndicators: [],
      supportingEvidenceLinks: [],
      chronologicalProgression: [],
      dataGaps: ['Fewer than two records have been sealed in this case.'],
      safetyRecommendations: [
        {
          action: 'Document Incoming Contact',
          detail: 'Keep original screenshots and exports untouched. Add them to this case with exact timestamps.',
        },
        {
          action: 'Indian Cybercrime Helpline 1930',
          detail: 'If you feel unsafe or are experiencing cyber harassment, dial 1930 or visit cybercrime.gov.in.',
        },
      ],
      legalDisclaimer:
        'VeraTrace does not predict human violence or calculate statistical risk scores. All assessments are descriptive summaries of user-supplied evidence.',
    };
  }

  // 2. Evaluate Indicators
  const detectedIndicators = [];
  const allSupportingLinks = [];

  // Helper to test text against keywords with word-boundary awareness for short words
  const matchesKeywords = (text, keywords) => {
    if (!text || !keywords.length) return false;
    const lower = text.toLowerCase();
    return keywords.some((kw) => {
      if (kw.length <= 4) {
        const regex = new RegExp(`\\b${kw}\\b`, 'i');
        return regex.test(lower);
      }
      return lower.includes(kw);
    });
  };

  // Helper to extract matching snippet
  const extractSnippet = (text, keywords) => {
    if (!text) return '';
    const lower = text.toLowerCase();
    for (const kw of keywords) {
      if (kw.length <= 4) {
        const regex = new RegExp(`\\b${kw}\\b`, 'i');
        const match = regex.exec(lower);
        if (match) {
          const idx = match.index;
          const start = Math.max(0, idx - 30);
          const end = Math.min(text.length, idx + kw.length + 40);
          return `“${text.slice(start, end).trim()}”`;
        }
      } else {
        const idx = lower.indexOf(kw);
        if (idx !== -1) {
          const start = Math.max(0, idx - 30);
          const end = Math.min(text.length, idx + kw.length + 40);
          return `“${text.slice(start, end).trim()}”`;
        }
      }
    }
    return `“${text.slice(0, 70).trim()}…”`;
  };

  // A. Check content/metadata-based indicators
  for (const def of RISK_INDICATOR_DEFINITIONS) {
    if (def.checkCondition || def.keywords.length > 0) {
      const matchedEvidence = [];

      for (const ev of evidence) {
        const textToScan = `${ev.notes || ''} ${ev.extractedText || ''} ${ev.fileName || ''} ${ev.userClaimedSource || ''}`;
        const hasKeyword = matchesKeywords(textToScan, def.keywords);
        const meetsCondition = def.checkCondition ? def.checkCondition(ev) : false;

        if (hasKeyword || meetsCondition) {
          const excerpt = extractSnippet(textToScan, def.keywords);
          matchedEvidence.push({
            evidenceId: ev.evidenceId,
            fileName: ev.fileName,
            sha256: ev.sha256,
            timestamp: ev.recordedAt,
            platform: detectPlatform(`${ev.userClaimedSource || ''} ${ev.fileName || ''}`).label,
            senderHandle: ev.senderHandle || 'Not specified',
            excerpt,
            confidence: LINK_CONFIDENCE.FACTUAL_OBSERVATION,
          });

          allSupportingLinks.push({
            indicatorId: def.id,
            indicatorName: def.name,
            evidenceId: ev.evidenceId,
            fileName: ev.fileName,
            excerpt,
          });
        }
      }

      // Also check timeline event labels
      for (const tl of timeline) {
        const hasKeyword = matchesKeywords(tl.label, def.keywords);
        const meetsCondition = def.checkCondition ? def.checkCondition(tl) : false;

        if (hasKeyword || meetsCondition) {
          const excerpt = extractSnippet(tl.label, def.keywords);
          matchedEvidence.push({
            evidenceId: tl.relatedEvidenceId || tl.eventId,
            fileName: tl.relatedEvidenceId ? `Linked evidence (${tl.relatedEvidenceId})` : 'Timeline entry',
            timestamp: tl.occurredAt,
            platform: detectPlatform(`${tl.platform || ''} ${tl.label || ''}`).label,
            senderHandle: tl.senderHandle || 'Not specified',
            excerpt,
            confidence: tl.timeConfidence === 'confirmed' ? LINK_CONFIDENCE.FACTUAL_OBSERVATION : LINK_CONFIDENCE.PROBABLE_CLUE,
          });

          allSupportingLinks.push({
            indicatorId: def.id,
            indicatorName: def.name,
            evidenceId: tl.relatedEvidenceId || tl.eventId,
            fileName: tl.label,
            excerpt,
          });
        }
      }

      if (matchedEvidence.length > 0) {
        detectedIndicators.push({
          id: def.id,
          name: def.name,
          severity: def.severity,
          description: def.description,
          count: matchedEvidence.length,
          supportingEvidence: matchedEvidence,
        });
      }
    }
  }

  // B. Check Cross-Platform Proliferation Indicator
  const platformsDetected = new Set();
  evidence.forEach((e) => platformsDetected.add(detectPlatform(`${e.userClaimedSource || ''} ${e.fileName || ''}`).id));
  timeline.forEach((t) => platformsDetected.add(detectPlatform(`${t.platform || ''} ${t.label || ''}`).id));

  if (platformsDetected.size >= 2) {
    const matchedEvidence = evidence.map((e) => ({
      evidenceId: e.evidenceId,
      fileName: e.fileName,
      sha256: e.sha256,
      timestamp: e.recordedAt,
      platform: detectPlatform(`${e.userClaimedSource || ''} ${e.fileName || ''}`).label,
      senderHandle: e.senderHandle || 'Not specified',
      excerpt: `Captured on ${detectPlatform(e.fileName).label}`,
      confidence: LINK_CONFIDENCE.FACTUAL_OBSERVATION,
    }));

    detectedIndicators.push({
      id: 'IND_CROSS_PLATFORM_PROLIFERATION',
      name: 'Cross-Platform Channel Proliferation',
      severity: INDICATOR_SEVERITY.ELEVATED,
      description: `Harassment activity detected across ${platformsDetected.size} independent platforms. Channel proliferation reflects deliberate expansion beyond initial communication boundaries.`,
      count: platformsDetected.size,
      supportingEvidence: matchedEvidence.slice(0, 4),
    });
  }

  // C. Check High Frequency Clustering & Burst Velocity
  const datedEvents = timeline
    .filter((e) => Boolean(e.occurredAt))
    .map((e) => ({
      timestamp: new Date(e.occurredAt).getTime(),
      label: e.label,
      occurredAt: e.occurredAt,
      relatedEvidenceId: e.relatedEvidenceId,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  let burstCount = 0;
  if (datedEvents.length >= 2) {
    for (let i = 1; i < datedEvents.length; i++) {
      const diffHours = (datedEvents[i].timestamp - datedEvents[i - 1].timestamp) / (1000 * 60 * 60);
      if (diffHours <= 48) burstCount += 1;
    }
  }

  if (burstCount > 0) {
    detectedIndicators.push({
      id: 'IND_ACCELERATING_VELOCITY',
      name: 'High Frequency Clustering & Velocity Acceleration',
      severity: INDICATOR_SEVERITY.ELEVATED,
      description: `${burstCount} incident transition(s) occurred within 48 hours of each other, indicating compressed incident frequency.`,
      count: burstCount,
      supportingEvidence: datedEvents.slice(0, 3).map((de) => ({
        evidenceId: de.relatedEvidenceId || 'timeline_event',
        fileName: de.label,
        timestamp: de.occurredAt,
        excerpt: de.label,
        confidence: LINK_CONFIDENCE.FACTUAL_OBSERVATION,
      })),
    });
  }

  // D. Check Nocturnal / Off-Hours Boundary Violation
  let nocturnalCount = 0;
  const nocturnalMatches = [];
  for (const de of datedEvents) {
    const d = new Date(de.occurredAt);
    const hourUtc = d.getUTCHours();
    const hourLocal = d.getHours();
    if (hourUtc >= 22 || hourUtc < 6 || hourLocal >= 22 || hourLocal < 6) {
      nocturnalCount += 1;
      nocturnalMatches.push({
        evidenceId: de.relatedEvidenceId || 'timeline_event',
        fileName: de.label,
        timestamp: de.occurredAt,
        excerpt: `Recorded at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        confidence: LINK_CONFIDENCE.FACTUAL_OBSERVATION,
      });
    }
  }

  if (nocturnalCount > 0) {
    detectedIndicators.push({
      id: 'IND_NOCTURNAL_INTRUSION',
      name: 'Nocturnal / Off-Hours Boundary Violation',
      severity: INDICATOR_SEVERITY.MONITOR,
      description: `${nocturnalCount} recorded touchpoint(s) took place during late-night hours (10:00 PM – 06:00 AM).`,
      count: nocturnalCount,
      supportingEvidence: nocturnalMatches,
    });
  }

  // 3. Chronological Progression Summary
  const chronologicalProgression = datedEvents.map((de, idx) => ({
    step: idx + 1,
    date: de.occurredAt,
    summary: de.label,
    linkedEvidenceId: de.relatedEvidenceId || null,
  }));

  // 4. Data Gaps and Missing Information
  const dataGaps = [];
  const uncertainEvents = timeline.filter((e) => e.timeConfidence === 'uncertain' || !e.occurredAt);
  if (uncertainEvents.length > 0) {
    dataGaps.push(`${uncertainEvents.length} timeline event(s) have uncertain or unverified dates.`);
  }
  const unlinkedEvidence = evidence.filter(
    (e) => !timeline.some((t) => t.relatedEvidenceId === e.evidenceId),
  );
  if (unlinkedEvidence.length > 0) {
    dataGaps.push(`${unlinkedEvidence.length} evidence file(s) are not yet linked to specific timeline milestones.`);
  }
  if (!evidence.some((e) => Boolean(e.senderHandle))) {
    dataGaps.push('Sender handles/numbers are missing from some evidence records.');
  }

  // 5. Tailored Safety and Reporting Actions
  const safetyRecommendations = [];

  const hasHighSeverity = detectedIndicators.some((i) => i.severity === INDICATOR_SEVERITY.HIGH);
  if (hasHighSeverity) {
    safetyRecommendations.push({
      priority: 'URGENT',
      action: 'Emergency Assistance (Dial 112)',
      detail: 'If you believe you are in immediate physical danger or being followed offline, contact emergency services (112) immediately.',
    });
  }

  safetyRecommendations.push({
    priority: 'OFFICIAL_COMPLAINT',
    action: 'Register Official Complaint on Cybercrime Portal',
    detail: 'Visit cybercrime.gov.in or dial National Cybercrime Helpline 1930. Provide the exported VeraTrace ZIP bundle and Section 63 certificate draft.',
  });

  safetyRecommendations.push({
    priority: 'PRESERVATION',
    action: 'Preserve Original Device State & Backups',
    detail: 'Do not delete the offending accounts, messages, or device backups. VeraTrace has secured SHA-256 hashes in your local vault.',
  });

  if (detectedIndicators.some((i) => i.id === 'IND_BLOCK_BYPASS')) {
    safetyRecommendations.push({
      priority: 'COMMUNICATION',
      action: 'Cease Direct Communication Across All Channels',
      detail: 'Avoid replying to alternate or burner accounts. Engaging often prompts escalation. Let documented evidence speak.',
    });
  }

  return {
    status: detectedIndicators.length > 0 ? 'ANALYSIS_COMPLETE' : 'NO_ESCALATION_DETECTED',
    isSufficient: true,
    indicatorsCount: detectedIndicators.length,
    highSeverityCount: detectedIndicators.filter((i) => i.severity === INDICATOR_SEVERITY.HIGH).length,
    observedIndicators: detectedIndicators,
    supportingEvidenceLinks: allSupportingLinks,
    chronologicalProgression,
    dataGaps,
    safetyRecommendations,
    legalDisclaimer:
      'This analysis identifies factual observable indicators from user-provided records. It is a forensic aid for documentation and does NOT predict human behavior, assign an arbitrary psychological score, or establish legal culpability.',
  };
}
