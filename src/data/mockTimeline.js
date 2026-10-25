// VeraTrace — mock timeline data (Person 2's domain).
//
// The timeline is built from evidence plus user-entered events, so it is
// replaced by the timeline half of src/services/evidenceStore.js (or a
// sibling module) once that lands. See src/services/README.md.

import { demoTimelineEvents } from './demoCaseData.js';

export const mockTimelineByCase = {
  'VT-DEMO-2026': demoTimelineEvents,
  case_1001: [
    {
      eventId: 'tl_1',
      occurredAt: '2026-09-14T09:40:00.000Z',
      timeConfidence: 'confirmed',
      label: 'First unwanted message received',
      relatedEvidenceId: 'ev_a1',
      platform: 'WhatsApp',
      senderHandle: '+91 98450 12345',
      blockedPrior: false,
    },
    {
      eventId: 'tl_2',
      occurredAt: '2026-09-16T11:00:00.000Z',
      timeConfidence: 'confirmed',
      label: 'Follow-up email sent to HR and inbox claiming offline commute tracking',
      relatedEvidenceId: 'ev_a2',
      platform: 'Email',
      senderHandle: 'anon_tracker99@proton.me',
      blockedPrior: false,
    },
    {
      eventId: 'tl_3',
      occurredAt: null,
      timeConfidence: 'uncertain',
      label: 'Approximate phone call timestamp (verbal threats from private number)',
      relatedEvidenceId: null,
      platform: 'Phone',
      senderHandle: 'Private Number',
      blockedPrior: false,
    },
    {
      eventId: 'tl_4',
      occurredAt: '2026-10-01T08:05:00.000Z',
      timeConfidence: 'confirmed',
      label: 'Contact resumed via Instagram DM (@shadow_99_alt) after WhatsApp blocking',
      relatedEvidenceId: 'ev_a3',
      platform: 'Instagram',
      senderHandle: '@shadow_99_alt',
      blockedPrior: true,
    },
  ],
  case_1002: [
    {
      eventId: 'tl_5',
      occurredAt: '2026-10-02T14:20:00.000Z',
      timeConfidence: 'confirmed',
      label: 'Fake profile discovered on Instagram impersonating victim and messaging mutual contacts',
      relatedEvidenceId: 'ev_b1',
      platform: 'Instagram',
      senderHandle: '@cloned_profile_user',
      blockedPrior: false,
    },
  ],
};
