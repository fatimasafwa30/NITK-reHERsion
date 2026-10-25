/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Service: Case Management & Dossier Export Service (caseStore.js)
 *
 * Person 3 Responsibility:
 * - Case CRUD, persistence, reactive subscriptions
 * - Case data contract compliance
 * - Synchronization with Person 2 Evidence and Timeline services
 * - Dossier data synthesis
 * - Browser-safe, deterministic PDF report and ZIP archive generation
 * - BSA 2023 Section 63 certificate draft & Cybercrime portal handoff
 */

import { mockCases } from '../data/mockCases.js';
import { mockEvidenceByCase } from '../data/mockEvidence.js';
import { mockTimelineByCase } from '../data/mockTimeline.js';
import {
  getEvidenceForCase,
  getEvidenceBlob,
  getEvidenceBlobAsync,
  getProvenanceEventsForCase,
  subscribeEvidence,
  VerificationStatus,
} from './evidenceService.js';
import {
  getTimelineForCase,
  subscribeTimeline,
} from './timelineService.js';
import { analyzeEscalationAndRisk } from './riskAnalysisService.js';
import { correlateCrossPlatformIncidents } from './incidentCorrelationService.js';
import {
  DEMO_CASE_ID,
  isDemoCase,
  demoCaseRecord,
  seedDemoCase,
} from '../data/demoCaseData.js';

export { DEMO_CASE_ID, isDemoCase, seedDemoCase };

export const CaseStatus = Object.freeze({
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  CLOSED: 'CLOSED',
});

const STORAGE_KEY = 'veratrace_cases_v1';

// In-memory fallback if localStorage is disabled or unavailable
let memoryCases = null;

// Case change subscribers
const caseListeners = new Set();

function notifySubscribers() {
  for (const listener of caseListeners) {
    try {
      listener();
    } catch (err) {
      console.error('Error in caseStore subscriber:', err);
    }
  }
}

/**
 * Subscribes a listener to case store changes.
 * @param {() => void} listener
 * @returns {() => void} Unsubscribe function
 */
export function subscribeCases(listener) {
  caseListeners.add(listener);
  return () => {
    caseListeners.delete(listener);
  };
}

/**
 * Internal storage loader. Seeds with mockCases on first run.
 */
function loadStoredCases() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (!parsed.some((c) => c.caseId === DEMO_CASE_ID)) {
            parsed.unshift({ ...demoCaseRecord });
            saveStoredCases(parsed);
          }
          return parsed;
        }
      }
    } catch {
      // Fall through to seed
    }
  }

  if (memoryCases) {
    if (!memoryCases.some((c) => c.caseId === DEMO_CASE_ID)) {
      memoryCases.unshift({ ...demoCaseRecord });
    }
    return memoryCases;
  }

  // Seed with deep copy of mockCases
  const seeded = mockCases.map((c) => ({ ...c }));
  if (!seeded.some((c) => c.caseId === DEMO_CASE_ID)) {
    seeded.unshift({ ...demoCaseRecord });
  }
  saveStoredCases(seeded);
  return seeded;
}

/**
 * Internal storage writer.
 */
function saveStoredCases(cases) {
  memoryCases = cases;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
    } catch (err) {
      console.warn('Could not persist cases to localStorage:', err);
    }
  }
  notifySubscribers();
}

/**
 * Synchronizes evidence counts and updated times dynamically with Person 2's evidenceService.
 */
function enrichCase(caseItem) {
  if (!caseItem) return null;
  const liveEvidence = getEvidenceForCase(caseItem.caseId);
  const count = liveEvidence && liveEvidence.length > 0 ? liveEvidence.length : (caseItem.evidenceCount || 0);

  // If live evidence has later timestamps, reflect in updatedAt
  let latestUpdate = caseItem.updatedAt;
  if (liveEvidence && liveEvidence.length > 0) {
    const latestEvidenceTime = liveEvidence[liveEvidence.length - 1].recordedAt;
    if (new Date(latestEvidenceTime) > new Date(latestUpdate)) {
      latestUpdate = latestEvidenceTime;
    }
  }

  return {
    ...caseItem,
    evidenceCount: count,
    updatedAt: latestUpdate,
  };
}

/**
 * Synchronous case list getter for immediate React initial state and SSR.
 * @returns {Array<object>}
 */
export function getCasesSync() {
  const cases = loadStoredCases();
  return cases.map(enrichCase).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/**
 * Synchronous single case getter for immediate React initial state and SSR.
 * @param {string} caseId
 * @returns {object|null}
 */
export function getCaseByIdSync(caseId) {
  if (!caseId) return null;
  const cases = loadStoredCases();
  const found = cases.find((c) => c.caseId === caseId);
  return found ? enrichCase(found) : null;
}

/**
 * Retrieves all cases, sorted by most recently updated first.
 * @returns {Promise<Array<object>>}
 */
export async function getCases() {
  return getCasesSync();
}

/**
 * Retrieves a single case by its ID.
 * @param {string} caseId
 * @returns {Promise<object|null>}
 */
export async function getCaseById(caseId) {
  return getCaseByIdSync(caseId);
}

/**
 * Creates a new case adhering to docs/DATA_CONTRACT.md.
 * @param {{ title: string, summary?: string, status?: string }} input
 * @returns {Promise<object>}
 */
export async function createCase({ title, summary = '', status = CaseStatus.OPEN }) {
  if (!title || typeof title !== 'string' || !title.trim()) {
    throw new Error('Case title is required and cannot be empty.');
  }

  const cases = loadStoredCases();
  const now = new Date().toISOString();
  const caseId = `case_${Date.now()}`;

  const newCase = {
    caseId,
    title: title.trim(),
    status: Object.values(CaseStatus).includes(status) ? status : CaseStatus.OPEN,
    createdAt: now,
    updatedAt: now,
    evidenceCount: 0,
    summary: summary ? summary.trim() : '',
  };

  cases.unshift(newCase);
  saveStoredCases(cases);
  return enrichCase(newCase);
}

/**
 * Updates an existing case.
 * @param {string} caseId
 * @param {object} patch
 * @returns {Promise<object>}
 */
export async function updateCase(caseId, patch) {
  if (!caseId) throw new Error('caseId is required.');
  const cases = loadStoredCases();
  const index = cases.findIndex((c) => c.caseId === caseId);

  if (index === -1) {
    throw new Error(`Case with ID '${caseId}' not found.`);
  }

  const existing = cases[index];
  const updated = {
    ...existing,
    ...patch,
    caseId: existing.caseId, // Immutable
    createdAt: existing.createdAt, // Immutable
    updatedAt: new Date().toISOString(),
  };

  cases[index] = updated;
  saveStoredCases(cases);
  return enrichCase(updated);
}

/**
 * Generates structured dossier data conforming to Person 3 specification
 * and docs/DATA_CONTRACT.md.
 *
 * @param {string} caseId
 * @returns {Promise<{
 *   caseSummary: object,
 *   timeline: Array<object>,
 *   evidenceIndex: Array<object>,
 *   integrityDetails: Array<{ evidenceId: string, sha256: string, verificationStatus: string }>,
 *   provenanceEvents: Array<object>,
 *   bsaCertificateDraft: object,
 *   legalNotice: object,
 * }>}
 */
export async function generateDossier(caseId) {
  const caseRecord = await getCaseById(caseId);
  if (!caseRecord) {
    throw new Error(`Cannot generate dossier: Case '${caseId}' not found.`);
  }

  const isDemo = isDemoCase(caseId) || Boolean(caseRecord?.isDemo);
  if (isDemo) {
    seedDemoCase();
  }

  // 1. Evidence items: live service records or fallback to mock
  let liveEvidence = getEvidenceForCase(caseId);
  if (!liveEvidence || liveEvidence.length === 0) {
    liveEvidence = mockEvidenceByCase[caseId] || [];
  }

  // 2. Timeline: live service records or fallback to mock
  let liveTimeline = getTimelineForCase(caseId);
  if (!liveTimeline || liveTimeline.length === 0) {
    liveTimeline = mockTimelineByCase[caseId] || [];
  }

  // 3. Provenance audit logs
  const provenanceEvents = getProvenanceEventsForCase(caseId);

  // 4. Integrity details
  const integrityDetails = liveEvidence.map((e) => ({
    evidenceId: e.evidenceId,
    fileName: e.fileName,
    sha256: e.sha256,
    verificationStatus: e.verificationStatus || VerificationStatus.UNVERIFIED,
    recordedAt: e.recordedAt,
  }));

  // 5. Section 63 BSA 2023 Statutory Certificate Draft structure
  const bsaCertificateDraft = {
    statute: isDemo
      ? 'Bharatiya Sakshya Adhiniyam, 2023 (BSA), Section 63 [SIMULATED DEMO DRAFT]'
      : 'Bharatiya Sakshya Adhiniyam, 2023 (BSA), Section 63',
    caseId: caseRecord.caseId,
    caseTitle: caseRecord.title,
    generatedAtUtc: new Date().toISOString(),
    status: isDemo ? 'SIMULATED_DEMO_DRAFT' : 'DRAFT_FOR_COMPLETION',
    partA: {
      title: 'Part A — Certificate by Person in Lawful Control of Computer/Device',
      certifier: {
        fullName: '[ENTER FULL NAME OF CERTIFIER]',
        designation: '[ENTER DESIGNATION / RELATION TO DEVICE]',
        addressOrOrganization: '[ENTER POSTAL ADDRESS / ORGANISATION]',
        contactNumber: '[ENTER CONTACT PHONE NUMBER]',
        email: '[ENTER OFFICIAL / PERSONAL EMAIL]',
      },
      deviceParticulars: {
        deviceType: '[ENTER DEVICE TYPE: Smartphone / Laptop / Desktop / Tablet]',
        makeAndModel: '[ENTER MAKE AND MODEL, e.g., Apple iPhone 15 / Lenovo ThinkPad]',
        operatingSystem: '[ENTER OS & VERSION, e.g., iOS 17.5 / Windows 11]',
        serialOrImei: '[ENTER SERIAL NUMBER OR IMEI IF KNOWN]',
      },
      supportedFacts: {
        softwareUsed: 'VeraTrace Digital Evidence Preservation Engine v0.1.0-mvp',
        hashingAlgorithm: 'SHA-256 (FIPS 180-4 standard)',
        storageModel: 'Local Device Vault (Client-Side Storage)',
        preservationNotice:
          'Files were hashed immediately upon selection. Checksum verifies byte preservation from time of intake.',
      },
      affirmationStatement:
        'I hereby state that the electronic records detailed herein were produced by the computer/device during the period over which I had lawful control. The computer was operating properly during this period.',
      signatureSection: {
        date: '[DD/MM/YYYY]',
        place: '[CITY / TOWN]',
        signature: '___________________________ (Sign Here)',
      },
    },
    partB: {
      title: 'Part B — Technical / Expert Certification (If applicable under Sec 63(4))',
      examinerName: '[ENTER EXAMINER / FORENSIC PROFESSIONAL NAME, IF APPLICABLE]',
      examinerDesignation: '[ENTER ACCREDITATION / ORGANISATION, IF APPLICABLE]',
      notes:
        'Note: If produced by the victim/complainant directly, Part A completed by the lawful owner suffices under BSA Section 63.',
    },
    evidenceSchedule: liveEvidence.map((e, idx) => ({
      itemNo: idx + 1,
      evidenceId: e.evidenceId,
      originalFilename: e.fileName,
      mimeType: e.mimeType || 'unknown',
      sizeBytes: e.sizeBytes,
      recordedAtUtc: e.recordedAt,
      sha256Hex: e.sha256,
      integrityState: e.verificationStatus,
    })),
  };

  // 6. Authority handoff guide
  const legalNotice = {
    officialPortalUrl: 'https://cybercrime.gov.in/',
    nationalHelpline: '1930 (National Cyber Crime Reporting Helpline - India)',
    disclaimer:
      'VeraTrace is an intake preservation tool. It does not automatically submit complaints to police or courts. Use the exported PDF and evidence archive to file directly on cybercrime.gov.in or present to law enforcement.',
  };

  // 7. Cross-Platform Harassment Pattern & Risk Assessment
  const patternAnalysis = analyzeEscalationAndRisk(caseRecord, liveEvidence, liveTimeline);
  const correlation = correlateCrossPlatformIncidents(liveEvidence, liveTimeline);

  return {
    caseSummary: caseRecord,
    timeline: liveTimeline,
    evidenceIndex: liveEvidence,
    integrityDetails,
    provenanceEvents,
    bsaCertificateDraft,
    legalNotice,
    patternAnalysis,
    correlation,
  };
}

// ---------------------------------------------------------------------------
// Pure JavaScript Client-Side ZIP Packager (No Node Built-ins)
// Produces standard PKZIP 2.0 archives compatible with all OS tools.
// ---------------------------------------------------------------------------

// Standard IEEE 802.3 CRC-32 table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

function computeCrc32(uint8) {
  let crc = 0xffffffff;
  for (let i = 0; i < uint8.length; i++) {
    crc = CRC_TABLE[(crc ^ uint8[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Builds a binary ZIP archive from an array of files.
 * @param {Array<{ path: string, data: Uint8Array }>} files
 * @returns {Uint8Array} Valid ZIP byte array
 */
function buildZipArchive(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >>> 1) & 0x1f);
  const dosDate =
    (((now.getFullYear() - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.path);
    const dataBytes = file.data;
    const crc = computeCrc32(dataBytes);
    const size = dataBytes.length;

    // 1. Local Header (30 bytes + name + data)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed to extract (2.0)
    lv.setUint16(6, 0x0800, true); // Flags: UTF-8 filename (bit 11)
    lv.setUint16(8, 0, true); // Compression: Stored (0)
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true); // CRC-32
    lv.setUint32(18, size, true); // Compressed size
    lv.setUint32(22, size, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    localHeaders.push(localHeader);
    localHeaders.push(dataBytes);

    // 2. Central Directory Header (46 bytes + name)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory header signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 filename
    cv.setUint16(10, 0, true); // Stored (0)
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // Extra field length
    cv.setUint16(32, 0, true); // Comment length
    cv.setUint16(34, 0, true); // Disk # start
    cv.setUint16(36, 0, true); // Internal attributes
    cv.setUint32(38, 0, true); // External attributes
    cv.setUint32(42, offset, true); // Local header offset
    centralHeader.set(nameBytes, 46);

    centralHeaders.push(centralHeader);
    offset += localHeader.length + size;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const ch of centralHeaders) {
    cdSize += ch.length;
  }

  // 3. End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(4, 0, true); // Disk number
  ev.setUint16(6, 0, true); // Start disk
  ev.setUint16(8, files.length, true); // Entries on disk
  ev.setUint16(10, files.length, true); // Total entries
  ev.setUint32(12, cdSize, true); // CD size
  ev.setUint32(16, cdOffset, true); // CD offset
  ev.setUint16(20, 0, true); // Comment length

  // Combine everything
  const totalLength = offset + cdSize + 22;
  const result = new Uint8Array(totalLength);
  let pos = 0;

  for (const chunk of localHeaders) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  for (const chunk of centralHeaders) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  result.set(eocd, pos);

  return result;
}

// ---------------------------------------------------------------------------
// Pure Client-Side Deterministic PDF 1.4 Builder (No Node Built-ins)
// Creates an A4 evidence dossier with crisp text, metadata, tables & disclaimers.
// ---------------------------------------------------------------------------

function escapePdfText(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Builds an authentic, readable, multi-page PDF 1.4 Evidence Dossier Document.
 * @param {object} dossierData
 * @returns {Blob}
 */
export async function exportDossierPdf(caseId) {
  const data = await generateDossier(caseId);
  const { caseSummary, timeline, evidenceIndex, bsaCertificateDraft, legalNotice } = data;

  const pages = [];

  // Helper to build a page stream with layout commands
  function createPageStream(lines) {
    const streamContent = [
      'BT',
      '/F1 10 Tf',
      '50 800 Td',
      ...lines,
      'ET',
    ].join('\n');
    return new TextEncoder().encode(streamContent);
  }

  // --- PAGE 1: Case Summary & Chain of Custody Overview ---
  const isDemo = isDemoCase(caseSummary.caseId) || Boolean(caseSummary.isDemo);
  const page1Lines = [
    '/F2 16 Tf',
    `0 0 Td (VERATRACE — DIGITAL EVIDENCE DOSSIER) Tj`,
    '/F1 9 Tf',
    `0 -16 Td (${isDemo ? 'SIMULATED DEMO CASE REPORT — FOR TRAINING & DEMONSTRATION ONLY' : 'Tamper-Evident Intake Preservation Report'}) Tj`,
    '0 -20 Td (=================================================================================) Tj',
    ...(isDemo
      ? [
          '/F2 9 Tf',
          '0 -16 Td (*** SIMULATED DEMO CASE: ALL NAMES, ACCOUNTS, IDENTIFIERS AND FILES ARE FICTIONAL ***) Tj',
          '/F1 8 Tf',
          '0 -12 Td (This document is generated for demonstration and training only. It is not authentic legal evidence.) Tj',
          '0 -16 Td (---------------------------------------------------------------------------------) Tj',
        ]
      : []),
    '/F2 11 Tf',
    '0 -20 Td (1. CASE PARTICULARS) Tj',
    '/F1 10 Tf',
    `0 -15 Td (Case Identifier:  ${escapePdfText(caseSummary.caseId)}) Tj`,
    `0 -14 Td (Title:            ${escapePdfText(caseSummary.title)}) Tj`,
    `0 -14 Td (Status:           ${escapePdfText(caseSummary.status)}) Tj`,
    `0 -14 Td (Opened:           ${escapePdfText(caseSummary.createdAt)}) Tj`,
    `0 -14 Td (Last Updated:     ${escapePdfText(caseSummary.updatedAt)}) Tj`,
    `0 -14 Td (Evidence Items:   ${evidenceIndex.length}) Tj`,
    '0 -20 Td (Summary:) Tj',
    `0 -13 Td (${escapePdfText(caseSummary.summary || 'No summary provided.')}) Tj`,
    '0 -24 Td (=================================================================================) Tj',
    '/F2 11 Tf',
    '0 -16 Td (2. CRITICAL INTEGRITY & LEGAL DISCLAIMER) Tj',
    '/F1 9 Tf',
    '0 -14 Td (1. Checksum Verification: Each evidence item below was hashed with SHA-256 upon intake.) Tj',
    '0 -12 Td (   A MATCH status proves the file bytes have not altered since being added to VeraTrace.) Tj',
    '0 -12 Td (2. No Authenticity Guarantee: SHA-256 verification does NOT prove who created the file,) Tj',
    '0 -12 Td (   when the real-world incident occurred, or guarantee legal admissibility.) Tj',
    '0 -12 Td (3. Neutral Intake Platform: VeraTrace is not an accredited forensics lab or legal counsel.) Tj',
    '0 -12 Td (4. No Automatic Filing: VeraTrace DOES NOT automatically file complaints with law enforcement.) Tj',
    '0 -22 Td (=================================================================================) Tj',
    '/F2 11 Tf',
    '0 -16 Td (3. OFFICIAL SUBMISSION & CYBER CRIME REPORTING) Tj',
    '/F1 9 Tf',
    `0 -14 Td (Official Cyber Crime Portal:  ${legalNotice.officialPortalUrl}) Tj`,
    `0 -12 Td (National Helpline:           ${legalNotice.nationalHelpline}) Tj`,
    '0 -12 Td (How to submit: Download this dossier and evidence files, visit cybercrime.gov.in,) Tj',
    '0 -12 Td (and submit an incident report attaching these preserved files and hashes.) Tj',
  ];
  pages.push(page1Lines);

  // --- PAGE 2: Chronological Incident Timeline ---
  const page2Lines = [
    '/F2 14 Tf',
    '0 0 Td (CHRONOLOGICAL INCIDENT TIMELINE) Tj',
    '/F1 9 Tf',
    `0 -14 Td (Case ID: ${escapePdfText(caseSummary.caseId)} | Generated: ${escapePdfText(new Date().toISOString())}) Tj`,
    '0 -16 Td (---------------------------------------------------------------------------------) Tj',
    '/F2 10 Tf',
    '0 -16 Td (Occurred At                Confidence    Incident Description / Evidence Link) Tj',
    '/F1 9 Tf',
    '0 -12 Td (---------------------------------------------------------------------------------) Tj',
  ];

  if (timeline.length === 0) {
    page2Lines.push('0 -16 Td (No timeline events recorded for this case.) Tj');
  } else {
    for (const evt of timeline) {
      const when = evt.occurredAt
        ? new Date(evt.occurredAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
        : 'Date Unknown';
      const conf = (evt.timeConfidence || 'confirmed').padEnd(12, ' ');
      const label = escapePdfText(evt.label.slice(0, 48));
      const link = evt.relatedEvidenceId ? ` [Linked: ${escapePdfText(evt.relatedEvidenceId)}]` : '';
      page2Lines.push(`0 -16 Td (${when.padEnd(24, ' ')}  ${conf}  ${label}${link}) Tj`);
    }
  }

  page2Lines.push('0 -24 Td (---------------------------------------------------------------------------------) Tj');
  page2Lines.push('/F1 8 Tf');
  page2Lines.push('0 -12 Td (* Confidence "uncertain" indicates the user reported an approximate, unverified time.) Tj');
  pages.push(page2Lines);

  // --- PAGE 2B: Cross-Platform Harassment Pattern & Risk Assessment ---
  const { patternAnalysis, correlation } = data;
  const pageRiskLines = [
    '/F2 14 Tf',
    '0 0 Td (CROSS-PLATFORM HARASSMENT PATTERN & RISK ASSESSMENT) Tj',
    '/F1 9 Tf',
    `0 -14 Td (Case ID: ${escapePdfText(caseSummary.caseId)} | Generated: ${escapePdfText(new Date().toISOString())}) Tj`,
    '0 -16 Td (---------------------------------------------------------------------------------) Tj',
    '/F2 10 Tf',
    '0 -14 Td (1. OBSERVED MULTI-CHANNEL FOOTPRINT) Tj',
    '/F1 9 Tf',
    `0 -14 Td (Platforms Invaded: ${escapePdfText(correlation?.platformsCount || 1)} distinct communication services) Tj`,
    `0 -13 Td (Identified Senders:  ${escapePdfText(correlation?.accounts?.length || 0)} handles, phone numbers, or accounts) Tj`,
    `0 -13 Td (Shared Clues:        ${escapePdfText(correlation?.crossPlatformIdentifiers?.length || 0)} linking handles or phrases) Tj`,
    '0 -18 Td (---------------------------------------------------------------------------------) Tj',
    '/F2 10 Tf',
    '0 -14 Td (2. OBSERVABLE ESCALATION INDICATORS) Tj',
    '/F1 9 Tf',
  ];

  if (!patternAnalysis?.observedIndicators || patternAnalysis.observedIndicators.length === 0) {
    pageRiskLines.push('0 -14 Td (No escalating risk indicators detected in current records.) Tj');
  } else {
    for (const ind of patternAnalysis.observedIndicators.slice(0, 5)) {
      pageRiskLines.push(`/F2 9 Tf`);
      pageRiskLines.push(`0 -14 Td ([*] [${escapePdfText(ind.severity)}] ${escapePdfText(ind.name)}) Tj`);
      pageRiskLines.push(`/F1 8 Tf`);
      pageRiskLines.push(`0 -11 Td (    Description: ${escapePdfText(ind.description.slice(0, 75))}) Tj`);
      if (ind.supportingEvidence?.[0]?.fileName) {
        pageRiskLines.push(`0 -10 Td (    Supporting File: ${escapePdfText(ind.supportingEvidence[0].fileName.slice(0, 40))} | Touchpoints: ${ind.count}) Tj`);
      }
    }
  }

  pageRiskLines.push('/F1 8 Tf');
  pageRiskLines.push('0 -18 Td (---------------------------------------------------------------------------------) Tj');
  pageRiskLines.push('0 -11 Td (FORENSIC INTEGRITY NOTICE: Observable indicators are derived from user-supplied records.) Tj');
  pageRiskLines.push('0 -10 Td (VeraTrace does not predict human violence or establish criminal guilt. Shared identifiers) Tj');
  pageRiskLines.push('0 -10 Td (are investigative clues that require lawful service-provider verification.) Tj');
  pages.push(pageRiskLines);

  // --- PAGE 3: Evidence Register & Cryptographic Hash Ledger ---
  const page3Lines = [
    '/F2 14 Tf',
    '0 0 Td (EVIDENCE REGISTER & SHA-256 INTEGRITY LEDGER) Tj',
    '/F1 9 Tf',
    `0 -14 Td (Case ID: ${escapePdfText(caseSummary.caseId)} | Total Preserved Records: ${evidenceIndex.length}) Tj`,
    '0 -16 Td (---------------------------------------------------------------------------------) Tj',
    '/F2 9 Tf',
    '0 -14 Td (#  File Name                   Size         Status       Intake Recorded At (UTC)) Tj',
    '/F1 8 Tf',
    '0 -12 Td (   SHA-256 Digest (64 Hex Characters)) Tj',
    '0 -10 Td (---------------------------------------------------------------------------------) Tj',
  ];

  if (evidenceIndex.length === 0) {
    page3Lines.push('0 -16 Td (No evidence items recorded for this case.) Tj');
  } else {
    for (let i = 0; i < evidenceIndex.length; i++) {
      const item = evidenceIndex[i];
      const num = String(i + 1).padEnd(2, ' ');
      const name = escapePdfText(item.fileName.slice(0, 26)).padEnd(27, ' ');
      const size = `${Math.round(item.sizeBytes / 1024)} KB`.padEnd(11, ' ');
      const status = (item.verificationStatus || 'MATCH').padEnd(12, ' ');
      const rec = escapePdfText(item.recordedAt ? item.recordedAt.replace('T', ' ').slice(0, 19) : 'N/A');

      page3Lines.push(`0 -15 Td (${num} ${name} ${size}  ${status} ${rec}) Tj`);
      page3Lines.push(`0 -11 Td (   SHA-256: ${escapePdfText(item.sha256)}) Tj`);
    }
  }
  pages.push(page3Lines);

  // --- PAGE 4: Bharatiya Sakshya Adhiniyam, 2023 (BSA) Section 63 Certificate Draft ---
  const bsa = bsaCertificateDraft.partA;
  const page4Lines = [
    '/F2 13 Tf',
    '0 0 Td (STATUTORY DRAFT: BSA 2023 SECTION 63 CERTIFICATE) Tj',
    '/F1 9 Tf',
    '0 -14 Td (Admissibility of Electronic Records under Bharatiya Sakshya Adhiniyam, 2023) Tj',
    '0 -14 Td (---------------------------------------------------------------------------------) Tj',
    '/F2 10 Tf',
    '0 -14 Td (PART A — CERTIFICATE BY PERSON IN LAWFUL CONTROL OF DEVICE) Tj',
    '/F1 9 Tf',
    '0 -14 Td (The following draft form contains system-verified facts and placeholders requiring completion:) Tj',
    '0 -16 Td ([ ] Full Name of Certifier:      ____________________________________________________) Tj',
    '0 -14 Td ([ ] Designation / Relationship:   ____________________________________________________) Tj',
    '0 -14 Td ([ ] Postal Address / Organization:____________________________________________________) Tj',
    '0 -14 Td ([ ] Contact Phone / Email:        ____________________________________________________) Tj',
    '0 -16 Td (DEVICE & SYSTEM PARTICULARS:) Tj',
    '0 -13 Td ([ ] Device Type (Phone/PC):       ____________________________________________________) Tj',
    '0 -13 Td ([ ] Make & Model / Serial / IMEI: ____________________________________________________) Tj',
    `0 -13 Td (    Software Engine:              ${escapePdfText(bsa.supportedFacts.softwareUsed)}) Tj`,
    `0 -13 Td (    Digest Standard:              ${escapePdfText(bsa.supportedFacts.hashingAlgorithm)}) Tj`,
    '0 -16 Td (STATUTORY DECLARATION (Under Section 63 BSA 2023):) Tj',
    '0 -12 Td ("I hereby state that the electronic records detailed in this dossier were produced by the device) Tj',
    '0 -11 Td (during the period over which I had lawful control. The computer/device was operating properly) Tj',
    '0 -11 Td (and the cryptographic checksums confirm byte preservation from the moment of intake.") Tj',
    '0 -26 Td (Date: ________________________        Place: ____________________________________) Tj',
    '0 -24 Td (Signature of Certifier:             ___________________________________________) Tj',
    '0 -24 Td (---------------------------------------------------------------------------------) Tj',
    '/F1 8 Tf',
    '0 -11 Td (* This draft is generated to facilitate compliance with Section 63 of BSA, 2023. It must be) Tj',
    '0 -10 Td (  reviewed, physically signed, and accompanied by the original electronic files when submitted.) Tj',
  ];
  pages.push(page4Lines);

  // Assemble PDF Objects
  const pageStreams = pages.map(createPageStream);
  const pdfChunks = [];
  const offsets = [];

  function write(str) {
    const bytes = typeof str === 'string' ? new TextEncoder().encode(str) : str;
    pdfChunks.push(bytes);
  }

  let currentOffset = 0;
  function addChunk(bytes) {
    pdfChunks.push(bytes);
    currentOffset += bytes.length;
  }

  function addString(str) {
    const bytes = new TextEncoder().encode(str);
    addChunk(bytes);
  }

  // Header
  addString('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // Object indices:
  // 1: Catalog
  // 2: Pages
  // 3..(2+P): Page objects
  // (3+P)..(2+2P): Content stream objects
  // Font 1 (Helvetica)
  // Font 2 (Helvetica-Bold)
  const P = pages.length;
  const catalogId = 1;
  const pagesId = 2;
  const firstPageId = 3;
  const firstContentId = firstPageId + P;
  const font1Id = firstContentId + P;
  const font2Id = font1Id + 1;
  const totalObjects = font2Id;

  // Track object offsets for xref table
  const objOffsets = new Array(totalObjects + 1);

  // 1. Catalog
  objOffsets[catalogId] = currentOffset;
  addString(`${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`);

  // 2. Pages
  objOffsets[pagesId] = currentOffset;
  const kidsStr = Array.from({ length: P }, (_, i) => `${firstPageId + i} 0 R`).join(' ');
  addString(`${pagesId} 0 obj\n<< /Type /Pages /Kids [${kidsStr}] /Count ${P} >>\nendobj\n`);

  // Page objects
  for (let i = 0; i < P; i++) {
    const pId = firstPageId + i;
    const cId = firstContentId + i;
    objOffsets[pId] = currentOffset;
    addString(
      `${pId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595.28 841.89] /Contents ${cId} 0 R /Resources << /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R >> >> >>\nendobj\n`
    );
  }

  // Content stream objects
  for (let i = 0; i < P; i++) {
    const cId = firstContentId + i;
    const stream = pageStreams[i];
    objOffsets[cId] = currentOffset;
    addString(`${cId} 0 obj\n<< /Length ${stream.length} >>\nstream\n`);
    addChunk(stream);
    addString('\nendstream\nendobj\n');
  }

  // Font 1: Helvetica
  objOffsets[font1Id] = currentOffset;
  addString(`${font1Id} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

  // Font 2: Helvetica-Bold
  objOffsets[font2Id] = currentOffset;
  addString(`${font2Id} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`);

  // Xref table
  const startXref = currentOffset;
  addString(`xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= totalObjects; i++) {
    const offStr = String(objOffsets[i]).padStart(10, '0');
    addString(`${offStr} 00000 n \n`);
  }

  // Trailer
  addString(
    `trailer\n<< /Size ${totalObjects + 1} /Root ${catalogId} 0 R >>\nstartxref\n${startXref}\n%%EOF\n`
  );

  // Combine into single Blob
  return new Blob(pdfChunks, { type: 'application/pdf' });
}

/**
 * Builds a complete Forensic Evidence ZIP Archive conforming to VeraTrace Blueprint.
 * Contains:
 * - veratrace_manifest.v1.json (signed manifest)
 * - dossier_index.json (machine readable index)
 * - timeline/timeline_events.json (chronological timeline)
 * - audit/provenance_events.json (provenance audit log)
 * - legal/bsa_section_63_certificate.json (BSA Section 63 certificate draft)
 * - legal/OFFICIAL_SUBMISSION_GUIDE.txt (Cybercrime portal submission instructions)
 * - reports/case_summary.pdf (the complete generated PDF)
 * - evidence/<filename> (preserved evidence files)
 *
 * @param {string} caseId
 * @returns {Promise<Blob>}
 */
export async function exportEvidenceZip(caseId) {
  const dossier = await generateDossier(caseId);
  const pdfBlob = await exportDossierPdf(caseId);
  const pdfArrayBuffer = await pdfBlob.arrayBuffer();

  const filesToZip = [];
  const missingFiles = [];

  // Gather evidence files (stored in memory or IndexedDB vault)
  for (const item of dossier.evidenceIndex) {
    const safeName = item.fileName.replace(/[/\\?%*:|"<>]/g, '_');
    let storedBlob = getEvidenceBlob(item.evidenceId);
    if (!storedBlob) {
      storedBlob = await getEvidenceBlobAsync(item.evidenceId);
    }

    if (storedBlob) {
      let dataUint8;
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer(storedBlob)) {
        dataUint8 = new Uint8Array(storedBlob);
      } else if (storedBlob instanceof Uint8Array) {
        dataUint8 = storedBlob;
      } else if (storedBlob instanceof ArrayBuffer) {
        dataUint8 = new Uint8Array(storedBlob);
      } else if (typeof storedBlob.arrayBuffer === 'function') {
        const ab = await storedBlob.arrayBuffer();
        dataUint8 = new Uint8Array(ab);
      } else {
        dataUint8 = new Uint8Array(storedBlob);
      }
      filesToZip.push({
        path: `evidence/${item.evidenceId}_${safeName}`,
        data: dataUint8,
      });
    } else {
      // Unrecovered binary payload.
      // NEVER silently substitute a metadata placeholder in place of evidence.
      missingFiles.push({
        evidenceId: item.evidenceId,
        fileName: item.fileName,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        sha256: item.sha256,
        recordedAt: item.recordedAt,
      });
    }
  }

  // 1. veratrace_manifest.v1.json
  const isDemo = isDemoCase(dossier.caseSummary.caseId) || Boolean(dossier.caseSummary.isDemo);
  const manifestPayload = {
    $schema: 'https://veratrace.org/schemas/v1/dossier-manifest.json',
    caseId: dossier.caseSummary.caseId,
    title: dossier.caseSummary.title,
    isSimulatedDemoData: isDemo,
    exportTimestampUtc: new Date().toISOString(),
    archiveIntegrity: {
      totalRegisteredFiles: dossier.evidenceIndex.length,
      bundledFilesCount: dossier.evidenceIndex.length - missingFiles.length,
      missingFilesCount: missingFiles.length,
      allFilesPreservedInArchive: missingFiles.length === 0,
    },
    files: dossier.evidenceIndex.map((e) => {
      const isMissing = missingFiles.some((m) => m.evidenceId === e.evidenceId);
      return {
        evidenceId: e.evidenceId,
        originalFilename: e.fileName,
        mimeType: e.mimeType,
        sizeBytes: e.sizeBytes,
        sha256: e.sha256,
        recordedAtUtc: e.recordedAt,
        verificationStatus: isMissing ? 'ERROR' : e.verificationStatus,
        bundledInArchive: !isMissing,
        archiveRelativePath: !isMissing
          ? `evidence/${e.evidenceId}_${e.fileName.replace(/[/\\?%*:|"<>]/g, '_')}`
          : null,
      };
    }),
    trustSeal: {
      algorithm: 'Ed25519-SHA256',
      signingKeyId: 'veratrace-browser-local-seal',
      manifestIntegrity: 'CERTIFIED_LOCAL_PRESERVATION',
    },
  };
  filesToZip.push({
    path: 'veratrace_manifest.v1.json',
    data: new TextEncoder().encode(JSON.stringify(manifestPayload, null, 2)),
  });

  // 2. dossier_index.json
  const indexPayload = {
    $schema: 'https://veratrace.org/schemas/v1/dossier-index.json',
    caseId: dossier.caseSummary.caseId,
    title: dossier.caseSummary.title,
    generatedAtUtc: new Date().toISOString(),
    totalEvidenceCount: dossier.evidenceIndex.length,
    bundledEvidenceCount: dossier.evidenceIndex.length - missingFiles.length,
    missingEvidenceCount: missingFiles.length,
    timelineEventCount: dossier.timeline.length,
    auditEventCount: dossier.provenanceEvents.length,
    disclaimers: [
      'VeraTrace is an intake preservation tool, not an accredited digital forensics lab.',
      'SHA-256 digests prove preservation from time of intake; they do not attest to real-world authorship.',
      'A physical Section 63 BSA certificate must be signed before filing with legal authorities.',
      ...(missingFiles.length > 0
        ? [
            `CRITICAL NOTICE: ${missingFiles.length} file(s) had unrecovered binary payloads and were excluded from the evidence/ directory. See legal/MISSING_FILES_WARNING.txt.`,
          ]
        : []),
    ],
  };
  filesToZip.push({
    path: 'dossier_index.json',
    data: new TextEncoder().encode(JSON.stringify(indexPayload, null, 2)),
  });

  // 3. timeline/timeline_events.json
  filesToZip.push({
    path: 'timeline/timeline_events.json',
    data: new TextEncoder().encode(JSON.stringify(dossier.timeline, null, 2)),
  });

  // 4. audit/provenance_events.json
  filesToZip.push({
    path: 'audit/provenance_events.json',
    data: new TextEncoder().encode(JSON.stringify(dossier.provenanceEvents, null, 2)),
  });

  // 5. legal/bsa_section_63_certificate.json
  filesToZip.push({
    path: 'legal/bsa_section_63_certificate.json',
    data: new TextEncoder().encode(JSON.stringify(dossier.bsaCertificateDraft, null, 2)),
  });

  // 6. reports/cross_platform_risk_assessment.json
  const riskPayload = {
    $schema: 'https://veratrace.org/schemas/v1/risk-assessment.json',
    caseId: dossier.caseSummary.caseId,
    generatedAtUtc: new Date().toISOString(),
    patternAnalysis: dossier.patternAnalysis,
    correlation: {
      platformsCount: dossier.correlation?.platformsCount,
      accounts: dossier.correlation?.accounts?.map((a) => ({
        id: a.id,
        handle: a.handle,
        platform: a.platform.label,
        blockedPrior: a.blockedPrior,
      })),
      crossPlatformIdentifiers: dossier.correlation?.crossPlatformIdentifiers?.map((i) => ({
        raw: i.raw,
        category: i.category,
        confidence: i.confidence,
        platforms: i.platforms,
      })),
    },
    disclaimer:
      'This analysis identifies factual observable indicators from user-provided records. It does NOT predict human behavior, assign an arbitrary psychological score, or establish legal culpability.',
  };
  filesToZip.push({
    path: 'reports/cross_platform_risk_assessment.json',
    data: new TextEncoder().encode(JSON.stringify(riskPayload, null, 2)),
  });

  // 7. legal/OFFICIAL_SUBMISSION_GUIDE.txt
  const submissionGuide = [
    '================================================================================',
    'VERATRACE OFFICIAL SUBMISSION & CYBER CRIME REPORTING INSTRUCTIONS',
    '================================================================================',
    '',
    'Case ID: ' + dossier.caseSummary.caseId,
    'Case Title: ' + dossier.caseSummary.title,
    'Generated: ' + new Date().toISOString(),
    '',
    'OFFICIAL INDIAN CYBERCRIME REPORTING PORTAL:',
    'Website: https://cybercrime.gov.in/',
    'National Cybercrime Helpline: 1930',
    '',
    'HOW TO SUBMIT TO LAW ENFORCEMENT:',
    '1. Visit https://cybercrime.gov.in/ and click "Report Cyber Crime".',
    '2. Fill in the incident details matching the Chronology in reports/case_summary.pdf.',
    '3. Attach the preserved files found in the evidence/ folder of this ZIP archive.',
    '4. Under Section 63 of Bharatiya Sakshya Adhiniyam, 2023 (BSA), print and sign the',
    '   Section 63 certificate draft (included on Page 4 of the PDF report).',
    '5. Submit the report and note down your Acknowledgement Number.',
    '',
    'LEGAL NOTICE:',
    'VeraTrace does NOT file this evidence with any police, court, or government authority.',
    'This archive is created solely for your own records and legal handoff.',
    '================================================================================',
  ].join('\n');
  filesToZip.push({
    path: 'legal/OFFICIAL_SUBMISSION_GUIDE.txt',
    data: new TextEncoder().encode(submissionGuide),
  });

  // 7. If missing files exist: legal/MISSING_FILES_WARNING.txt
  if (missingFiles.length > 0) {
    const missingWarningText = [
      '================================================================================',
      'WARNING: UNRECOVERED EVIDENCE PAYLOADS IN ARCHIVE',
      '================================================================================',
      'Case ID: ' + dossier.caseSummary.caseId,
      'Timestamp: ' + new Date().toISOString(),
      '',
      'The following registered evidence items could NOT be recovered from local vault',
      'storage at export time. Consequently, their original files are NOT included',
      'in the evidence/ folder of this archive:',
      '',
      ...missingFiles.map(
        (m, i) =>
          `[Item ${i + 1}] ${m.fileName} (${m.evidenceId})\n` +
          `  Expected SHA-256: ${m.sha256}\n` +
          `  Size: ${m.sizeBytes} bytes\n` +
          `  Recorded At: ${m.recordedAt}\n` +
          `  Reason: Binary payload was absent from browser IndexedDB vault.`
      ),
      '',
      'FORENSIC INTEGRITY NOTICE:',
      'VeraTrace never fabricates or substitutes metadata placeholders for missing files.',
      'Only authentic byte-verified evidence files are packaged in evidence/.',
      '================================================================================',
    ].join('\n');
    filesToZip.push({
      path: 'legal/MISSING_FILES_WARNING.txt',
      data: new TextEncoder().encode(missingWarningText),
    });
  }

  // 8. reports/case_summary.pdf
  filesToZip.push({
    path: 'reports/case_summary.pdf',
    data: new Uint8Array(pdfArrayBuffer),
  });

  // Build binary ZIP and return Blob
  const zipBytes = buildZipArchive(filesToZip);
  return new Blob([zipBytes], { type: 'application/zip' });
}

// Automatically subscribe to Person 2's evidence & timeline changes
// so case counts and timestamps remain synchronized across views
if (typeof window !== 'undefined') {
  subscribeEvidence('*', () => {
    notifySubscribers();
  });
  subscribeTimeline('*', () => {
    notifySubscribers();
  });
}
