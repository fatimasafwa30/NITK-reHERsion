import { describe, it, expect, beforeEach } from 'vitest';
import {
  CaseStatus,
  getCases,
  getCaseById,
  createCase,
  updateCase,
  generateDossier,
  exportDossierPdf,
  exportEvidenceZip,
  subscribeCases,
} from '../../../src/services/caseStore.js';
import { syncEvidenceRecord, clearEvidenceForCase, VerificationStatus } from '../../../src/services/evidenceService.js';
import { addTimelineEventForCase, clearTimelineForCase } from '../../../src/services/timelineService.js';

describe('Person 3: CaseStore & Dossier Export Service', () => {
  beforeEach(() => {
    // Clear localStorage simulation if in test environment
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  describe('Case Lifecycle & Persistence', () => {
    it('seeds mock cases on first access adhering to docs/DATA_CONTRACT.md', async () => {
      const cases = await getCases();
      expect(cases.length).toBeGreaterThanOrEqual(3);

      const firstCase = cases.find((c) => c.caseId === 'case_1001');
      expect(firstCase).toBeDefined();
      expect(firstCase?.title).toBe('Workplace harassment — messages & emails');
      expect(firstCase?.status).toBe(CaseStatus.IN_PROGRESS);
      expect(firstCase?.createdAt).toBeDefined();
      expect(firstCase?.updatedAt).toBeDefined();
      expect(typeof firstCase?.evidenceCount).toBe('number');
      expect(typeof firstCase?.summary).toBe('string');
    });

    it('retrieves an individual case by id', async () => {
      const caseRecord = await getCaseById('case_1002');
      expect(caseRecord).not.toBeNull();
      expect(caseRecord?.caseId).toBe('case_1002');
      expect(caseRecord?.title).toBe('Online impersonation — fake profile');
    });

    it('returns null for non-existent case id', async () => {
      const nonExistent = await getCaseById('case_999999');
      expect(nonExistent).toBeNull();
    });

    it('creates a new case and persists it reactively', async () => {
      let notified = false;
      const unsubscribe = subscribeCases(() => {
        notified = true;
      });

      const newCase = await createCase({
        title: 'Cyberbullying and stalking on campus',
        summary: 'Targeted abusive comments and threatening direct messages.',
        status: CaseStatus.OPEN,
      });

      expect(newCase.caseId).toMatch(/^case_\d+/);
      expect(newCase.title).toBe('Cyberbullying and stalking on campus');
      expect(newCase.summary).toBe('Targeted abusive comments and threatening direct messages.');
      expect(newCase.status).toBe(CaseStatus.OPEN);
      expect(newCase.evidenceCount).toBe(0);
      expect(notified).toBe(true);

      const allCases = await getCases();
      const found = allCases.find((c) => c.caseId === newCase.caseId);
      expect(found).toBeDefined();

      unsubscribe();
    });

    it('rejects case creation with empty title', async () => {
      await expect(createCase({ title: '   ' })).rejects.toThrow('Case title is required');
    });

    it('updates an existing case status and fields', async () => {
      const cases = await getCases();
      const target = cases[0];

      const updated = await updateCase(target.caseId, {
        status: CaseStatus.CLOSED,
        summary: 'Updated case summary.',
      });

      expect(updated.status).toBe(CaseStatus.CLOSED);
      expect(updated.summary).toBe('Updated case summary.');
      expect(updated.caseId).toBe(target.caseId); // Immutable
      expect(updated.createdAt).toBe(target.createdAt); // Immutable
    });
  });

  describe('Evidence Count & Dynamic Synchronization', () => {
    it('dynamically reflects live evidence count added via Person 2 pipeline', async () => {
      const testCase = await createCase({
        title: 'Dynamic Evidence Test Case',
      });

      clearEvidenceForCase(testCase.caseId);

      // Initially 0
      const initial = await getCaseById(testCase.caseId);
      expect(initial?.evidenceCount).toBe(0);

      // Ingest live evidence record into Person 2's store
      syncEvidenceRecord(testCase.caseId, {
        evidenceId: 'ev_sync_1',
        caseId: testCase.caseId,
        fileName: 'threatening_message.png',
        originalFilename: 'threatening_message.png',
        mimeType: 'image/png',
        sizeBytes: 2048,
        recordedAt: new Date().toISOString(),
        sha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        verificationStatus: VerificationStatus.MATCH,
        storageKey: `cases/${testCase.caseId}/raw/ev_sync_1`,
        intakeStatus: 'PROMOTED',
      });

      // Query case again
      const refreshed = await getCaseById(testCase.caseId);
      expect(refreshed?.evidenceCount).toBe(1);
    });
  });

  describe('Dossier Synthesis & Export', () => {
    const caseId = 'case_1001';

    beforeEach(() => {
      clearEvidenceForCase(caseId);
      clearTimelineForCase(caseId);

      syncEvidenceRecord(caseId, {
        evidenceId: 'ev_dos_1',
        caseId,
        fileName: 'chat_threat_evidence.png',
        originalFilename: 'chat_threat_evidence.png',
        mimeType: 'image/png',
        sizeBytes: 15420,
        recordedAt: '2026-09-14T10:06:00.000Z',
        sha256: '1aa09fc38fed9bfe5d5726bd261038068a4b5ca7d6bf3cab44cb601165bd0b47',
        verificationStatus: VerificationStatus.MATCH,
        storageKey: `cases/${caseId}/raw/ev_dos_1`,
        intakeStatus: 'PROMOTED',
      });

      addTimelineEventForCase(caseId, {
        caseId,
        label: 'Threatening direct message sent to victim',
        occurredAt: '2026-09-14T09:40:00.000Z',
        timeConfidence: 'confirmed',
        relatedEvidenceId: 'ev_dos_1',
      });
    });

    it('generates structured dossier with summary, timeline, evidence, and BSA draft', async () => {
      const dossier = await generateDossier(caseId);

      expect(dossier.caseSummary.caseId).toBe(caseId);
      expect(dossier.evidenceIndex.length).toBeGreaterThanOrEqual(1);
      expect(dossier.timeline.length).toBeGreaterThanOrEqual(1);
      expect(dossier.integrityDetails[0].sha256).toBe(
        '1aa09fc38fed9bfe5d5726bd261038068a4b5ca7d6bf3cab44cb601165bd0b47'
      );

      // Verify Section 63 BSA 2023 certificate draft
      expect(dossier.bsaCertificateDraft).toBeDefined();
      expect(dossier.bsaCertificateDraft.statute).toContain('Bharatiya Sakshya Adhiniyam, 2023');
      expect(dossier.bsaCertificateDraft.partA.certifier).toBeDefined();
      expect(dossier.bsaCertificateDraft.partA.supportedFacts.hashingAlgorithm).toBe(
        'SHA-256 (FIPS 180-4 standard)'
      );

      // Verify Official Cybercrime Portal handoff
      expect(dossier.legalNotice.officialPortalUrl).toBe('https://cybercrime.gov.in/');
      expect(dossier.legalNotice.nationalHelpline).toContain('1930');
    });

    it('exports a valid binary PDF dossier Blob with %PDF-1.4 header', async () => {
      const pdfBlob = await exportDossierPdf(caseId);

      expect(pdfBlob).toBeInstanceOf(Blob);
      expect(pdfBlob.type).toBe('application/pdf');
      expect(pdfBlob.size).toBeGreaterThan(500);

      const arrayBuffer = await pdfBlob.arrayBuffer();
      const textHeader = new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(0, 8)));
      expect(textHeader).toContain('%PDF-1.4');

      const fullText = new TextDecoder().decode(new Uint8Array(arrayBuffer));
      expect(fullText).toContain('VERATRACE');
      expect(fullText).toContain('1aa09fc38fed9bfe5d5726bd261038068a4b5ca7d6bf3cab44cb601165bd0b47');
      expect(fullText).toContain('cybercrime.gov.in');
      expect(fullText).toContain('Bharatiya Sakshya Adhiniyam');
      expect(fullText).toContain('%%EOF');
    });

    it('exports a valid PKZIP evidence archive Blob with PK\\x03\\x04 signature', async () => {
      const zipBlob = await exportEvidenceZip(caseId);

      expect(zipBlob).toBeInstanceOf(Blob);
      expect(zipBlob.type).toBe('application/zip');
      expect(zipBlob.size).toBeGreaterThan(500);

      const arrayBuffer = await zipBlob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      // Verify standard PKZIP magic bytes (0x50, 0x4B, 0x03, 0x04)
      expect(bytes[0]).toBe(0x50);
      expect(bytes[1]).toBe(0x4b);
      expect(bytes[2]).toBe(0x03);
      expect(bytes[3]).toBe(0x04);

      // Verify archive content entries
      const zipString = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      expect(zipString).toContain('veratrace_manifest.v1.json');
      expect(zipString).toContain('dossier_index.json');
      expect(zipString).toContain('timeline/timeline_events.json');
      expect(zipString).toContain('legal/bsa_section_63_certificate.json');
      expect(zipString).toContain('legal/OFFICIAL_SUBMISSION_GUIDE.txt');
      expect(zipString).toContain('reports/case_summary.pdf');
    });
  });
});
