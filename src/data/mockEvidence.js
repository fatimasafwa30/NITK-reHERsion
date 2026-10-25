// VeraTrace — mock evidence data (Person 2's domain).
//
// Replaced by src/services/evidenceStore.js once hashing/verification lands.
// See src/services/README.md for the expected function names.

export const VerificationStatus = Object.freeze({
  UNVERIFIED: 'UNVERIFIED',
  MATCH: 'MATCH',
  MISMATCH: 'MISMATCH',
  ERROR: 'ERROR',
});

import { demoEvidenceRecords } from './demoCaseData.js';

export const mockEvidenceByCase = {
  'VT-DEMO-2026': demoEvidenceRecords,
  case_1001: [
    {
      evidenceId: 'ev_a1',
      fileName: 'chat-screenshot-1.png',
      mimeType: 'image/png',
      sizeBytes: 482_112,
      recordedAt: '2026-09-14T10:06:00.000Z',
      sha256: '1aa09fc38fed9bfe5d5726bd261038068a4b5ca7d6bf3cab44cb601165bd0b47',
      verificationStatus: VerificationStatus.MATCH,
      platform: 'WhatsApp',
      userClaimedSource: 'WhatsApp Direct Chat',
      senderHandle: '+91 98450 12345',
      notes: 'Unsolicited late-night messages threatening to ruin reputation at workplace if ignored.',
      sharedIdentifiers: ['+91 98450 12345', 'career_ruin', 'shadow_99'],
      incidentType: 'COERCION',
      blockedPrior: false,
    },
    {
      evidenceId: 'ev_a2',
      fileName: 'email-thread.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 198_240,
      recordedAt: '2026-09-16T11:30:00.000Z',
      sha256: 'df4cec96e425c6be3f585acc287b66e7dc7123f83bdacb8a57d95c1773e00bf',
      verificationStatus: VerificationStatus.UNVERIFIED,
      platform: 'Email',
      userClaimedSource: 'Workplace & Personal Email',
      senderHandle: 'anon_tracker99@proton.me',
      notes: 'Follow-up email quoting prior WhatsApp demands, claiming to know my office commute route.',
      sharedIdentifiers: ['career_ruin', 'anon_tracker99@proton.me', 'shadow_99'],
      incidentType: 'OFFLINE_SURVEILLANCE',
      blockedPrior: false,
    },
    {
      evidenceId: 'ev_a3',
      fileName: 'chat-screenshot-2.png',
      mimeType: 'image/png',
      sizeBytes: 511_904,
      recordedAt: '2026-10-01T08:12:00.000Z',
      sha256: 'cd5459e251ee97922e2c7e13dfd28ca5a83e60686da91a499efe5f3ef24c9d8',
      verificationStatus: VerificationStatus.MISMATCH,
      platform: 'Instagram',
      userClaimedSource: 'Instagram Direct Message',
      senderHandle: '@shadow_99_alt',
      notes: 'Contact initiated from newly created Instagram account after WhatsApp number was blocked.',
      sharedIdentifiers: ['shadow_99', '@shadow_99_alt'],
      incidentType: 'BLOCK_BYPASS',
      blockedPrior: true,
    },
  ],
  case_1002: [
    {
      evidenceId: 'ev_b1',
      fileName: 'fake-profile-screenshot.png',
      mimeType: 'image/png',
      sizeBytes: 702_341,
      recordedAt: '2026-10-02T14:25:00.000Z',
      sha256: 'a9e8908882d237e9a77b862b7b430964dcc87832ba98dbeeddba5ccb5824db8',
      verificationStatus: VerificationStatus.MATCH,
      platform: 'Instagram',
      userClaimedSource: 'Instagram Impersonation Profile',
      senderHandle: '@cloned_profile_user',
      notes: 'Impersonation profile with stolen photos messaging mutual contacts asking for contact numbers.',
      sharedIdentifiers: ['@cloned_profile_user', 'mutual_contacts'],
      incidentType: 'IMPERSONATION',
      blockedPrior: false,
    },
  ],
};
