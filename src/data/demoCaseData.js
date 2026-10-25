/**
 * VeraTrace — Complete Interactive Demo Case
 *
 * Case: Case VT-DEMO-2026 — Cross-Platform Harassment Investigation
 *
 * Fictional scenario involving multi-platform unwanted contact across
 * WhatsApp, Instagram, Email, and SMS, demonstrating:
 * - Cross-platform incident correlation
 * - Shared identifier matching
 * - Block-bypass & secondary channel migration detection
 * - Nocturnal intrusion detection
 * - Transparent uncertainty & forensic disclaimers
 * - BSA 2023 Section 63 statutory certificate draft preparation
 *
 * ALL IDENTITIES, ACCOUNTS, PHONES, AND MESSAGES ARE STRICTLY SIMULATED DEMO DATA.
 */

export const CaseStatus = Object.freeze({
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  CLOSED: 'CLOSED',
});

export const VerificationStatus = Object.freeze({
  UNVERIFIED: 'UNVERIFIED',
  MATCH: 'MATCH',
  MISMATCH: 'MISMATCH',
  ERROR: 'ERROR',
});

import { getDemoAssetBuffer } from './demoAssetPayloads.js';
import { syncEvidenceRecord, storeEvidenceBlob } from '../services/evidenceService.js';
import { addTimelineEventForCase } from '../services/timelineService.js';

export const DEMO_CASE_ID = 'VT-DEMO-2026';

export function isDemoCase(caseId) {
  if (!caseId) return false;
  return caseId === DEMO_CASE_ID || caseId.startsWith('VT-DEMO');
}

export const demoCaseRecord = Object.freeze({
  caseId: DEMO_CASE_ID,
  title: 'Case VT-DEMO-2026 — Cross-Platform Harassment Investigation',
  status: CaseStatus.IN_PROGRESS,
  createdAt: '2026-10-12T10:00:00.000Z',
  updatedAt: '2026-10-19T18:30:00.000Z',
  evidenceCount: 5,
  summary:
    'SIMULATED DEMO DATA: Coercive multi-channel contact and boundary violations across WhatsApp, Instagram, Email, and SMS following an explicit block request.',
  notes:
    'Investigative training case demonstrating VeraTrace cross-platform correlation, block-bypass detection, and BSA Section 63 electronic evidence preservation.',
  isDemo: true,
});

export const demoEvidenceRecords = Object.freeze([
  {
    evidenceId: 'ev_demo_01',
    caseId: DEMO_CASE_ID,
    fileName: 'chat-whatsapp-incident-1.png',
    originalFilename: 'chat-whatsapp-incident-1.png',
    mimeType: 'image/png',
    sizeBytes: 8863,
    recordedAt: '2026-10-12T23:50:00.000Z',
    sha256: '657097d4b533c4df0ec8bac27ade247e469aeaef44b9b5ea9d38fc2e224abbdf',
    verificationStatus: VerificationStatus.MATCH,
    platform: 'WhatsApp',
    userClaimedSource: 'WhatsApp Direct Chat (Illustrative URL: https://api.whatsapp.com/send?phone=919820144892)',
    senderHandle: '+91 98201 44892',
    notes:
      'Late-night ultimatum demanding confidential design portfolio assets; threats to email team lead if ignored. [SIMULATED DEMO DATA]',
    sharedIdentifiers: ['+91 98201 44892', 'karan_archive', 'career_ruin'],
    incidentType: 'COERCION',
    blockedPrior: false,
    previewUrl: '/demo-assets/chat-whatsapp-incident-1.png',
    storageKey: 'cases/VT-DEMO-2026/raw/ev_demo_01',
    intakeStatus: 'PROMOTED',
  },
  {
    evidenceId: 'ev_demo_02',
    caseId: DEMO_CASE_ID,
    fileName: 'chat-instagram-incident-2.png',
    originalFilename: 'chat-instagram-incident-2.png',
    mimeType: 'image/png',
    sizeBytes: 8587,
    recordedAt: '2026-10-16T10:30:00.000Z',
    sha256: 'c96367053bb9167c448d13e110398c0681790c87c37c04d79fde94eb62ab2577',
    verificationStatus: VerificationStatus.MATCH,
    platform: 'Instagram',
    userClaimedSource: 'Instagram DM (@karan_archive_temp, Illustrative URL: https://instagram.com/karan_archive_temp)',
    senderHandle: '@karan_archive_temp',
    notes:
      'Block bypass contact via newly created burner account citing prior WhatsApp block, physical office commute route on 4th street, and protonmail address. [SIMULATED DEMO DATA]',
    sharedIdentifiers: ['karan_archive', '@karan_archive_temp', 'karan.v.design@proton.me', 'project_starlight_leak'],
    incidentType: 'BLOCK_BYPASS',
    blockedPrior: true,
    previewUrl: '/demo-assets/chat-instagram-incident-2.png',
    storageKey: 'cases/VT-DEMO-2026/raw/ev_demo_02',
    intakeStatus: 'PROMOTED',
  },
  {
    evidenceId: 'ev_demo_03',
    caseId: DEMO_CASE_ID,
    fileName: 'chat-sms-incident-3.png',
    originalFilename: 'chat-sms-incident-3.png',
    mimeType: 'image/png',
    sizeBytes: 6737,
    recordedAt: '2026-10-18T23:55:00.000Z',
    sha256: '7c05baba2ebb55e6c8e92dd00cd2d7cbabf0942f20deb85f9969f133ce8d59cd',
    verificationStatus: VerificationStatus.MATCH,
    platform: 'SMS',
    userClaimedSource: 'Cellular SMS from +91 98201 44892',
    senderHandle: '+91 98201 44892',
    notes:
      'Late-night SMS ultimatum reiterating project_starlight_leak threat and 24-hour deadline before public disclosure on LinkedIn. [SIMULATED DEMO DATA]',
    sharedIdentifiers: ['+91 98201 44892', 'project_starlight_leak', 'karan_archive'],
    incidentType: 'COERCION',
    blockedPrior: true,
    previewUrl: '/demo-assets/chat-sms-incident-3.png',
    storageKey: 'cases/VT-DEMO-2026/raw/ev_demo_03',
    intakeStatus: 'PROMOTED',
  },
  {
    evidenceId: 'ev_demo_04',
    caseId: DEMO_CASE_ID,
    fileName: 'whatsapp-chat-export-oct2026.txt',
    originalFilename: 'whatsapp-chat-export-oct2026.txt',
    mimeType: 'text/plain',
    sizeBytes: 1613,
    recordedAt: '2026-10-14T09:20:00.000Z',
    sha256: 'e22924e3dca4722a09f8e988924e4f9103b57358b622bf93b151c00f97ba910b',
    verificationStatus: VerificationStatus.MATCH,
    platform: 'WhatsApp',
    userClaimedSource: 'WhatsApp In-App Export Stream',
    senderHandle: '+91 98201 44892',
    notes:
      'Complete text conversation export including victim refusal request and system block notification. [SIMULATED DEMO DATA]',
    sharedIdentifiers: ['+91 98201 44892', 'karan_archive'],
    incidentType: 'COERCION',
    blockedPrior: false,
    previewUrl: '/demo-assets/whatsapp-chat-export-oct2026.txt',
    storageKey: 'cases/VT-DEMO-2026/raw/ev_demo_04',
    intakeStatus: 'PROMOTED',
  },
  {
    evidenceId: 'ev_demo_05',
    caseId: DEMO_CASE_ID,
    fileName: 'hr-incident-report-oct2026.pdf',
    originalFilename: 'hr-incident-report-oct2026.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2811,
    recordedAt: '2026-10-15T15:30:00.000Z',
    sha256: '3488bdbd8f90502e7dce56c62cd4029719f37cef1d9273015a5687baa33408a0',
    verificationStatus: VerificationStatus.MATCH,
    platform: 'Email',
    userClaimedSource: 'Internal Workplace HR Submission',
    senderHandle: 'karan.v.design@proton.me',
    notes:
      'Formal HR documentation draft referencing email harassment, commute route surveillance, and BSA Section 63 electronic evidence preparation. [SIMULATED DEMO DATA]',
    sharedIdentifiers: ['karan.v.design@proton.me', 'karan_archive', 'project_starlight_leak'],
    incidentType: 'OFFLINE_SURVEILLANCE',
    blockedPrior: false,
    previewUrl: '/demo-assets/hr-incident-report-oct2026.pdf',
    storageKey: 'cases/VT-DEMO-2026/raw/ev_demo_05',
    intakeStatus: 'PROMOTED',
  },
]);

export const demoTimelineEvents = Object.freeze([
  {
    eventId: 'tl_demo_1',
    caseId: DEMO_CASE_ID,
    occurredAt: '2026-10-12T23:42:00.000Z',
    timeConfidence: 'confirmed',
    label: 'Initial nocturnal message received on WhatsApp demanding portfolio files with career threats',
    relatedEvidenceId: 'ev_demo_01',
    platform: 'WhatsApp',
    senderHandle: '+91 98201 44892',
    blockedPrior: false,
  },
  {
    eventId: 'tl_demo_2',
    caseId: DEMO_CASE_ID,
    occurredAt: '2026-10-13T09:15:00.000Z',
    timeConfidence: 'confirmed',
    label: 'Explicit refusal sent to sender requesting all communications cease immediately',
    relatedEvidenceId: 'ev_demo_04',
    platform: 'WhatsApp',
    senderHandle: '+91 98201 44892',
    blockedPrior: false,
  },
  {
    eventId: 'tl_demo_3',
    caseId: DEMO_CASE_ID,
    occurredAt: '2026-10-14T08:30:00.000Z',
    timeConfidence: 'confirmed',
    label: 'Sender phone number +91 98201 44892 blocked on WhatsApp following repeated contact',
    relatedEvidenceId: 'ev_demo_04',
    platform: 'WhatsApp',
    senderHandle: '+91 98201 44892',
    blockedPrior: false,
  },
  {
    eventId: 'tl_demo_4',
    caseId: DEMO_CASE_ID,
    occurredAt: '2026-10-15T14:00:00.000Z',
    timeConfidence: 'confirmed',
    label: 'Internal workplace incident report submitted to HR citing cross-channel harassment',
    relatedEvidenceId: 'ev_demo_05',
    platform: 'Email',
    senderHandle: 'karan.v.design@proton.me',
    blockedPrior: false,
  },
  {
    eventId: 'tl_demo_5',
    caseId: DEMO_CASE_ID,
    occurredAt: '2026-10-16T10:15:00.000Z',
    timeConfidence: 'confirmed',
    label: 'Block bypass: Contact resumed via Instagram burner @karan_archive_temp citing commute route',
    relatedEvidenceId: 'ev_demo_02',
    platform: 'Instagram',
    senderHandle: '@karan_archive_temp',
    blockedPrior: true,
  },
  {
    eventId: 'tl_demo_6',
    caseId: DEMO_CASE_ID,
    occurredAt: '2026-10-18T23:48:00.000Z',
    timeConfidence: 'confirmed',
    label: 'Late-night SMS received from +91 98201 44892 threatening project_starlight_leak distribution',
    relatedEvidenceId: 'ev_demo_03',
    platform: 'SMS',
    senderHandle: '+91 98201 44892',
    blockedPrior: true,
  },
]);

/**
 * Seeds the complete demo case into runtime stores and vaults.
 * Idempotent: Never duplicates cases or overwrites real user cases.
 */
export function seedDemoCase(options = { overwrite: false }) {
  // 1. Seed Evidence records and binary payloads
  for (const record of demoEvidenceRecords) {
    syncEvidenceRecord(DEMO_CASE_ID, record);

    const buffer = getDemoAssetBuffer(record.fileName);
    if (buffer) {
      storeEvidenceBlob(record.evidenceId, buffer);
    }
  }

  // 2. Seed Timeline events
  for (const event of demoTimelineEvents) {
    addTimelineEventForCase(DEMO_CASE_ID, event);
  }

  return DEMO_CASE_ID;
}
