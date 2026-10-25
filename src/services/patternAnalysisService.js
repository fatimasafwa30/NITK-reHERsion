/**
 * VeraTrace — Cross-Platform Harassment Pattern Analysis Engine
 *
 * Deterministically analyzes evidence records, timestamps, and timeline chronology
 * to detect multi-channel harassment footprints, cross-platform escalation sequences,
 * temporal velocity, and off-hours contact patterns.
 *
 * Factual and forensically neutral: summarizes structured data without fabricating claims.
 */

export const KNOWN_PLATFORMS = Object.freeze({
  WHATSAPP: {
    id: 'whatsapp',
    label: 'WhatsApp',
    color: 'emerald',
    badgeClass: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    dotClass: 'bg-emerald-500',
  },
  INSTAGRAM: {
    id: 'instagram',
    label: 'Instagram',
    color: 'fuchsia',
    badgeClass: 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800',
    dotClass: 'bg-fuchsia-500',
  },
  TELEGRAM: {
    id: 'telegram',
    label: 'Telegram',
    color: 'sky',
    badgeClass: 'border-sky-300 bg-sky-50 text-sky-800',
    dotClass: 'bg-sky-500',
  },
  EMAIL: {
    id: 'email',
    label: 'Email',
    color: 'amber',
    badgeClass: 'border-amber-300 bg-amber-50 text-amber-800',
    dotClass: 'bg-amber-500',
  },
  SMS: {
    id: 'sms',
    label: 'SMS / Text',
    color: 'indigo',
    badgeClass: 'border-indigo-300 bg-indigo-50 text-indigo-800',
    dotClass: 'bg-indigo-500',
  },
  PHONE: {
    id: 'phone',
    label: 'Phone Call / Voice',
    color: 'violet',
    badgeClass: 'border-violet-300 bg-violet-50 text-violet-800',
    dotClass: 'bg-violet-500',
  },
  SOCIAL_WEB: {
    id: 'social_web',
    label: 'Social / Web / Other',
    color: 'purple',
    badgeClass: 'border-purple-300 bg-purple-50 text-purple-800',
    dotClass: 'bg-purple-500',
  },
  DIRECT_VERBAL: {
    id: 'direct_verbal',
    label: 'Direct / Verbal / Workplace',
    color: 'slate',
    badgeClass: 'border-slate-300 bg-slate-50 text-slate-800',
    dotClass: 'bg-slate-500',
  },
});

/**
 * Detects the communications platform from text clues, claimed source, or filenames.
 * @param {string} text
 * @returns {typeof KNOWN_PLATFORMS[keyof typeof KNOWN_PLATFORMS]}
 */
export function detectPlatform(text = '') {
  if (!text || typeof text !== 'string') return KNOWN_PLATFORMS.DIRECT_VERBAL;
  const lower = text.toLowerCase();

  if (lower.includes('whatsapp') || lower.includes('wa_') || lower.endsWith('.opus') || lower.includes('wa audio')) {
    return KNOWN_PLATFORMS.WHATSAPP;
  }
  if (
    lower.includes('instagram') ||
    lower.includes('insta') ||
    lower.includes('ig dm') ||
    lower.includes('ig story') ||
    lower.includes('fake profile') ||
    lower.includes('fake-profile')
  ) {
    return KNOWN_PLATFORMS.INSTAGRAM;
  }
  if (lower.includes('telegram') || lower.includes('tg_') || lower.includes('t.me')) {
    return KNOWN_PLATFORMS.TELEGRAM;
  }
  if (
    lower.includes('phone') ||
    lower.includes('call') ||
    lower.includes('voice') ||
    lower.includes('voicemail') ||
    lower.includes('dial') ||
    lower.includes('audio note')
  ) {
    return KNOWN_PLATFORMS.PHONE;
  }
  if (
    lower.includes('email') ||
    lower.includes('mail') ||
    lower.includes('gmail') ||
    lower.includes('outlook') ||
    lower.includes('thread.pdf') ||
    lower.endsWith('.eml')
  ) {
    return KNOWN_PLATFORMS.EMAIL;
  }
  if (lower.includes('sms') || lower.includes('text message') || lower.includes('imessage')) {
    return KNOWN_PLATFORMS.SMS;
  }
  if (
    lower.includes('facebook') ||
    lower.includes('fb') ||
    lower.includes('twitter') ||
    lower.includes('x.com') ||
    lower.includes('discord') ||
    lower.includes('linkedin') ||
    lower.includes('profile')
  ) {
    return KNOWN_PLATFORMS.SOCIAL_WEB;
  }
  if (
    lower.includes('verbal') ||
    lower.includes('hr') ||
    lower.includes('workplace') ||
    lower.includes('in-person') ||
    lower.includes('meeting')
  ) {
    return KNOWN_PLATFORMS.DIRECT_VERBAL;
  }

  // Default heuristic fallback: if screenshot, check if chat
  if (lower.includes('chat') || lower.includes('screenshot')) {
    return KNOWN_PLATFORMS.WHATSAPP;
  }

  return KNOWN_PLATFORMS.SOCIAL_WEB;
}

/**
 * Analyzes case evidence and timeline events to identify cross-platform harassment patterns.
 *
 * @param {object} caseRecord
 * @param {Array<object>} evidenceList
 * @param {Array<object>} timelineList
 * @returns {object} Structured Pattern Analysis Result
 */
export function analyzeHarassmentPattern(caseRecord, evidenceList = [], timelineList = []) {
  const events = [...timelineList];
  const evidence = [...evidenceList];

  // Map each evidence item to its detected platform
  const evidencePlatforms = evidence.map((item) => {
    const rawHint = `${item.userClaimedSource || ''} ${item.fileName || ''} ${item.originalFilename || ''}`;
    const platform = detectPlatform(rawHint);
    return {
      evidenceId: item.evidenceId,
      fileName: item.fileName,
      recordedAt: item.recordedAt,
      platform,
    };
  });

  // Map each timeline event to its detected platform
  const timelinePlatforms = events.map((event) => {
    let rawHint = event.label || '';
    if (event.relatedEvidenceId) {
      const match = evidence.find((e) => e.evidenceId === event.relatedEvidenceId);
      if (match) {
        rawHint += ` ${match.userClaimedSource || ''} ${match.fileName || ''}`;
      }
    }
    const platform = detectPlatform(rawHint);
    return {
      eventId: event.eventId,
      label: event.label,
      occurredAt: event.occurredAt,
      timeConfidence: event.timeConfidence,
      platform,
    };
  });

  // Aggregate platforms across both evidence and timeline
  const platformCounts = new Map();
  const addCount = (plat) => {
    const prev = platformCounts.get(plat.id) || { platform: plat, count: 0, items: [] };
    prev.count += 1;
    platformCounts.set(plat.id, prev);
  };

  evidencePlatforms.forEach((e) => addCount(e.platform));
  timelinePlatforms.forEach((t) => addCount(t.platform));

  const detectedPlatforms = Array.from(platformCounts.values()).sort((a, b) => b.count - a.count);
  const totalTouchpoints = evidencePlatforms.length + timelinePlatforms.length;
  const distinctPlatformCount = detectedPlatforms.length;
  const isMultiPlatform = distinctPlatformCount >= 2;

  // Chronological escalation trajectory
  const datedEvents = events
    .filter((e) => Boolean(e.occurredAt))
    .map((e) => {
      let rawHint = e.label || '';
      if (e.relatedEvidenceId) {
        const match = evidence.find((ev) => ev.evidenceId === e.relatedEvidenceId);
        if (match) rawHint += ` ${match.fileName || ''}`;
      }
      return {
        timestamp: new Date(e.occurredAt).getTime(),
        iso: e.occurredAt,
        label: e.label,
        platform: detectPlatform(rawHint),
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  // Determine platform sequence without immediate duplicates (e.g. [Instagram, WhatsApp, Phone])
  const escalationHops = [];
  for (const de of datedEvents) {
    if (escalationHops.length === 0 || escalationHops[escalationHops.length - 1].platform.id !== de.platform.id) {
      escalationHops.push({
        platform: de.platform,
        occurredAt: de.iso,
        label: de.label,
      });
    }
  }

  // Off-hours detection (10:00 PM to 06:00 AM local/UTC)
  let offHoursCount = 0;
  for (const de of datedEvents) {
    const d = new Date(de.iso);
    const utcHour = d.getUTCHours();
    const localHour = d.getHours();
    if (utcHour >= 22 || utcHour < 6 || localHour >= 22 || localHour < 6) {
      offHoursCount += 1;
    }
  }

  // Velocity / time span calculation
  let timespanDays = 0;
  let burstDetected = false;
  if (datedEvents.length >= 2) {
    const firstTime = datedEvents[0].timestamp;
    const lastTime = datedEvents[datedEvents.length - 1].timestamp;
    timespanDays = Math.max(1, Math.round((lastTime - firstTime) / (1000 * 60 * 60 * 24)));

    // Check if any two consecutive incidents occurred within 48 hours
    for (let i = 1; i < datedEvents.length; i++) {
      const diffHours = (datedEvents[i].timestamp - datedEvents[i - 1].timestamp) / (1000 * 60 * 60);
      if (diffHours <= 48 && datedEvents[i].platform.id !== datedEvents[i - 1].platform.id) {
        burstDetected = true;
        break;
      }
    }
  }

  // Key findings generation
  const findings = [];
  if (isMultiPlatform) {
    findings.push({
      type: 'MULTI_PLATFORM',
      title: `Cross-Platform Spread (${distinctPlatformCount} Channels)`,
      description: `Incidents document contact across ${detectedPlatforms
        .map((p) => p.platform.label)
        .join(', ')}. Multi-channel spread indicates persistent outreach across communication boundaries.`,
      highlight: true,
    });
  } else if (distinctPlatformCount === 1) {
    findings.push({
      type: 'SINGLE_PLATFORM',
      title: `Single-Channel Focus (${detectedPlatforms[0]?.platform.label || 'Direct'})`,
      description: `Recorded activity is currently concentrated within ${detectedPlatforms[0]?.platform.label || 'a single channel'}.`,
      highlight: false,
    });
  }

  if (escalationHops.length >= 2) {
    findings.push({
      type: 'CHANNEL_HOPPING',
      title: 'Cross-Channel Transition Pattern',
      description: `Sequence shows contact shifting from ${escalationHops[0].platform.label} to ${
        escalationHops[escalationHops.length - 1].platform.label
      }. Such shifts frequently coincide with account blocking or escalation to more private channels.`,
      highlight: true,
    });
  }

  if (offHoursCount > 0) {
    findings.push({
      type: 'OFF_HOURS',
      title: `${offHoursCount} Late-Night / Off-Hours Touchpoint(s)`,
      description: `${offHoursCount} recorded event(s) occurred between 10:00 PM and 6:00 AM. Off-hours contact is an objective marker of intrusion into private rest hours.`,
      highlight: true,
    });
  }

  if (burstDetected) {
    findings.push({
      type: 'BURST_VELOCITY',
      title: 'Rapid Cross-Platform Burst Detected',
      description: 'Multiple incidents occurred within a 48-hour window across different services, reflecting condensed harassment frequency.',
      highlight: true,
    });
  }

  return {
    caseId: caseRecord?.caseId || 'unknown',
    caseTitle: caseRecord?.title || '',
    totalTouchpoints,
    distinctPlatformCount,
    isMultiPlatform,
    detectedPlatforms,
    escalationHops,
    offHoursCount,
    timespanDays,
    burstDetected,
    findings,
    evidencePlatforms,
    timelinePlatforms,
    disclaimer:
      'Pattern analysis provides structured chronological aggregation based on uploaded filenames, claimed sources, and recorded events. It organizes verifiable facts and does not replace human evaluation or legal counsel.',
  };
}
