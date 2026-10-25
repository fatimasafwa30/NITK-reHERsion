/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Unit Tests: Module K — BSA 2023 Section 63 Certificate Generator
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 1.2, 8.1, 8.2, 8.3, 12, 14.2 (#8 Deterministic BSA Check), 16.1
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  generateBsaSection63CertificateDraft,
  evaluatePartACompleteness,
  BsaCertificateError,
  STATUTORY_SECTION_63_DISCLAIMERS,
} from '../../../src/lib/legal/bsaCertificateGenerator.js';
import {
  OFFICIAL_BSA_2023_SOURCE,
  BSA_CERTIFICATE_DRAFT_SCHEMA_V1,
} from '../../../src/lib/legal/bsaCertificateTypes.js';
import { CURATED_STATUTORY_SOURCES } from '../../../src/lib/legal/curatedLegalSources.js';
import { packageDossier } from '../../../src/lib/forensics/dossierPackager.js';
import { verifyDossierZipArchiveOffline } from '../../../src/lib/forensics/offlineVerifier.js';
import { LocalStorageAdapter } from '../../../src/lib/storage/localStorageAdapter.js';
import { getRawKey, getDossierKey } from '../../../src/lib/storage/storageTypes.js';
import { hashBuffer } from '../../../src/lib/forensics/streamingHasher.js';
import { generateEd25519KeyPair, createPublicKeyset } from '../../../src/lib/forensics/manifestSigner.js';

const TEST_STORAGE_DIR = path.resolve('./storage_test_bsa_cert');

describe('Module K: BSA 2023 Section 63 Certificate Generator', () => {
  const sampleCase = {
    caseId: 'case-bsa-test-889',
    title: 'Harassment & Non-Consensual Image Distribution',
    category: 'HARASSMENT_STALKING',
    summary: 'Targeted abuse received via Telegram and WhatsApp.',
  };

  const sampleEvidenceItems = [
    {
      evidenceId: 'ev-screenshot-01',
      originalFilename: 'whatsapp_chat_screenshot.png',
      mediaType: 'image/png',
      fileSizeBytes: 245120,
      sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      sha512: '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
      systemReceiptUtc: '2026-10-25T12:00:00.000Z',
      sourceClassification: 'USER_UPLOAD',
      captureMethod: 'Manual Screenshot on iOS 17.5',
      userClaimedSource: 'Direct WhatsApp Chat',
      claimedEventTime: '2026-10-25T11:45:00',
      claimedTimezone: 'Asia/Kolkata',
      processingEventsCount: 5,
    },
    {
      evidenceId: 'ev-audio-02',
      originalFilename: 'threat_voicenote.ogg',
      mediaType: 'audio/ogg',
      fileSizeBytes: 512000,
      sha256: 'f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f',
      systemReceiptUtc: '2026-10-25T12:05:00.000Z',
      sourceClassification: 'USER_UPLOAD',
      processingEventsCount: 4,
    },
  ];

  const completePartAInput = {
    certifier: {
      certifierName: 'Priya Sharma',
      parentage: 'D/o Rajesh Sharma',
      residentialAddress: 'Flat 402, Shanti Vihar, New Delhi - 110001',
      relationshipToCase: 'VICTIM' as const,
    },
    device: {
      deviceType: 'SMARTPHONE' as const,
      deviceMake: 'Apple',
      deviceModel: 'iPhone 14 Pro',
      serialOrImeiNumber: 'IMEI-354892019283741',
      operatingSystem: 'iOS 17.5.1',
      storageCapacity: '256 GB',
    },
    affirmations: {
      regularOperationAffirmation: true,
      ordinaryCourseAffirmation: true,
      operatingConditionAffirmation: true,
      reproductionAccuracyAffirmation: true,
      lawfulCustodyAffirmation: true,
    },
  };

  describe('1. Draft Certificate Generation & Technical Fidelity', () => {
    it('generates a valid, complete Section 63 certificate draft when all inputs are provided', () => {
      const draft = generateBsaSection63CertificateDraft({
        caseInfo: sampleCase,
        evidenceItems: sampleEvidenceItems,
        partAInput: completePartAInput,
        manifestContext: {
          signingKeyId: 'veratrace-ed25519-2026-q4',
          manifestContentSha256: '99887766554433221100aabbccddeeff99887766554433221100aabbccddeeff',
          ed25519SignaturePresent: true,
        },
      });

      expect(draft.$schema).toBe(BSA_CERTIFICATE_DRAFT_SCHEMA_V1);
      expect(draft.caseId).toBe(sampleCase.caseId);
      expect(draft.caseTitle).toBe(sampleCase.title);
      expect(draft.statutoryReference).toEqual(OFFICIAL_BSA_2023_SOURCE);

      // Evaluation
      expect(draft.evaluation.overallStatus).toBe('DRAFT_READY_FOR_HUMAN_SIGNATURE');
      expect(draft.evaluation.partAStatus).toBe('DRAFT_READY_FOR_HUMAN_SIGNATURE');
      expect(draft.evaluation.partBStatus).toBe('REQUIRES_QUALIFIED_EXPERT_REVIEW');
      expect(draft.evaluation.isPartAComplete).toBe(true);
      expect(draft.evaluation.missingFields).toHaveLength(0);
      expect(draft.evaluation.deficiencyReasons).toHaveLength(0);

      // Evidence Items Ledger
      expect(draft.evidenceItems).toHaveLength(2);
      expect(draft.evidenceItems[0].evidenceId).toBe('ev-screenshot-01');
      expect(draft.evidenceItems[0].sha256Hex).toBe(sampleEvidenceItems[0].sha256);
      expect(draft.evidenceItems[0].sha512Hex).toBe(sampleEvidenceItems[0].sha512);
      expect(draft.evidenceItems[0].captureMethod).toBe('Manual Screenshot on iOS 17.5');

      // Part A
      expect(draft.partA.authorityModel).toBe('HUMAN_PARTY_AFFIRMATION');
      expect(draft.partA.certifier.certifierName).toBe('Priya Sharma');
      expect(draft.partA.device.deviceMake).toBe('Apple');
      expect(draft.partA.device.deviceModel).toBe('iPhone 14 Pro');
      expect(draft.partA.affirmations.lawfulCustodyAffirmation).toBe(true);
      expect(draft.partA.affirmations.operatingConditionAffirmation).toBe(true);

      // Part B
      expect(draft.partB.authorityModel).toBe('QUALIFIED_EXPERT_REVIEW');
      expect(draft.partB.attestationStatus).toContain('REQUIRES_QUALIFIED_EXPERT_OR_POLICE_EXAMINER_REVIEW');
      expect(draft.partB.technicalParameters.evidenceCount).toBe(2);
      expect(draft.partB.technicalParameters.manifestEd25519TrustSealPresent).toBe(true);
      expect(draft.partB.technicalParameters.manifestSigningKeyId).toBe('veratrace-ed25519-2026-q4');
    });

    it('populates immutable technical facts accurately without human interference', () => {
      const draft = generateBsaSection63CertificateDraft({
        caseInfo: sampleCase,
        evidenceItems: [sampleEvidenceItems[0]],
      });

      const item = draft.evidenceItems[0];
      expect(item.fileSizeBytes).toBe(245120);
      expect(item.sha256Hex).toBe(sampleEvidenceItems[0].sha256);
      expect(item.mediaType).toBe('image/png');
      expect(item.systemReceiptUtc).toBe('2026-10-25T12:00:00.000Z');
    });
  });

  describe('2. Deterministic Completeness & Deficiency Tracking (Blueprint 14.2 #8)', () => {
    it('flags DEFICIENT_DRAFT when device make or model is missing', () => {
      const deficientDeviceInput = {
        certifier: { certifierName: 'Rahul Verma' },
        device: { deviceType: 'SMARTPHONE' as const }, // missing make and model!
        affirmations: {
          regularOperationAffirmation: true,
          ordinaryCourseAffirmation: true,
          operatingConditionAffirmation: true,
          reproductionAccuracyAffirmation: true,
          lawfulCustodyAffirmation: true,
        },
      };

      const draft = generateBsaSection63CertificateDraft({
        caseInfo: sampleCase,
        evidenceItems: sampleEvidenceItems,
        partAInput: deficientDeviceInput,
      });

      expect(draft.evaluation.overallStatus).toBe('DEFICIENT_DRAFT');
      expect(draft.evaluation.partAStatus).toBe('DEFICIENT');
      expect(draft.evaluation.isPartAComplete).toBe(false);
      expect(draft.evaluation.missingFields).toContain('partA.device.deviceMake');
      expect(draft.evaluation.missingFields).toContain('partA.device.deviceModel');
      expect(draft.evaluation.deficiencyReasons.some((r) => r.includes('Section 63(4)(b)'))).toBe(true);
    });

    it('flags DEFICIENT_DRAFT when certifier name is missing or empty', () => {
      const deficientCertifierInput = {
        certifier: { certifierName: '   ' }, // empty string
        device: { deviceMake: 'Samsung', deviceModel: 'Galaxy S24' },
        affirmations: {
          regularOperationAffirmation: true,
          ordinaryCourseAffirmation: true,
          operatingConditionAffirmation: true,
          reproductionAccuracyAffirmation: true,
          lawfulCustodyAffirmation: true,
        },
      };

      const draft = generateBsaSection63CertificateDraft({
        caseInfo: sampleCase,
        evidenceItems: sampleEvidenceItems,
        partAInput: deficientCertifierInput,
      });

      expect(draft.evaluation.overallStatus).toBe('DEFICIENT_DRAFT');
      expect(draft.evaluation.missingFields).toContain('partA.certifier.certifierName');
    });

    it('flags DEFICIENT_DRAFT when statutory affirmations are false or unconfirmed', () => {
      const unconfirmedAffirmationsInput = {
        certifier: { certifierName: 'Sunita Patel' },
        device: { deviceMake: 'Dell', deviceModel: 'XPS 15' },
        affirmations: {
          regularOperationAffirmation: true,
          ordinaryCourseAffirmation: false, // unconfirmed!
          operatingConditionAffirmation: true,
          reproductionAccuracyAffirmation: true,
          lawfulCustodyAffirmation: false, // unconfirmed!
        },
      };

      const draft = generateBsaSection63CertificateDraft({
        caseInfo: sampleCase,
        evidenceItems: sampleEvidenceItems,
        partAInput: unconfirmedAffirmationsInput,
      });

      expect(draft.evaluation.overallStatus).toBe('DEFICIENT_DRAFT');
      expect(draft.evaluation.missingFields).toContain('partA.affirmations.ordinaryCourseAffirmation');
      expect(draft.evaluation.missingFields).toContain('partA.affirmations.lawfulCustodyAffirmation');
      expect(draft.evaluation.deficiencyReasons.some((r) => r.includes('Section 63(2)(b)'))).toBe(true);
      expect(draft.evaluation.deficiencyReasons.some((r) => r.toLowerCase().includes('lawful custody'))).toBe(true);
    });

    it('evaluates completely empty partAInput without crashing and reports all missing fields', () => {
      const draft = generateBsaSection63CertificateDraft({
        caseInfo: sampleCase,
        evidenceItems: sampleEvidenceItems,
      });

      expect(draft.evaluation.overallStatus).toBe('DEFICIENT_DRAFT');
      expect(draft.evaluation.missingFields.length).toBeGreaterThanOrEqual(7);
      expect(draft.evaluation.isPartAComplete).toBe(false);
    });
  });

  describe('3. Legal Integrity & Authority Separation Guardrails', () => {
    it('never fabricates signatures, dates of signature, or expert accreditation', () => {
      const draft = generateBsaSection63CertificateDraft({
        caseInfo: sampleCase,
        evidenceItems: sampleEvidenceItems,
        partAInput: completePartAInput,
      });

      // Part A signatures must be null
      expect(draft.partA.signedAtUtc).toBeNull();
      expect(draft.partA.signatureLocation).toBeNull();
      expect(draft.partA.attestationStatus).toBe('DRAFT_UNATTESTED_PENDING_HUMAN_SIGNATURE');
      expect(draft.partA.humanSignatureRequiredNotice).toContain('personally review all statements');

      // Part B expert fields must be null placeholders
      expect(draft.partB.expertSignatoryPlaceholders.expertName).toBeNull();
      expect(draft.partB.expertSignatoryPlaceholders.designation).toBeNull();
      expect(draft.partB.expertSignatoryPlaceholders.accreditationOrCadre).toBeNull();
      expect(draft.partB.expertSignatoryPlaceholders.signedAtUtc).toBeNull();
      expect(draft.partB.expertSignatoryPlaceholders.sealOrStamp).toBeNull();
    });

    it('embeds mandatory statutory disclaimers disclaiming automatic legal admissibility', () => {
      const draft = generateBsaSection63CertificateDraft({
        caseInfo: sampleCase,
        evidenceItems: sampleEvidenceItems,
        partAInput: completePartAInput,
      });

      expect(draft.statutoryDisclaimers).toHaveLength(5);
      expect(draft.statutoryDisclaimers.some((d) => d.includes('Not Legal Advice or Admissibility Guarantee'))).toBe(true);
      expect(draft.statutoryDisclaimers.some((d) => d.includes('Human Attestation Mandatory'))).toBe(true);
      expect(draft.statutoryDisclaimers.some((d) => d.includes('No Phantom Filing'))).toBe(true);
      expect(draft.statutoryDisclaimers.some((d) => d.includes('Byte Preservation vs Content Authenticity'))).toBe(true);
      expect(draft.statutoryDisclaimers.some((d) => d.includes('Section 63(4) Expert Requirement'))).toBe(true);
    });

    it('includes unresolved judicial interpretation notice on Section 63(4) expert requirement', () => {
      const draft = generateBsaSection63CertificateDraft({
        caseInfo: sampleCase,
        evidenceItems: sampleEvidenceItems,
        partAInput: completePartAInput,
      });

      expect(draft.partB.unresolvedJudicialInterpretationNotice).toContain('AND an expert');
      expect(draft.partB.unresolvedJudicialInterpretationNotice).toContain('High Courts');
      expect(draft.partB.unresolvedJudicialInterpretationNotice).toContain('qualified legal counsel');
    });
  });

  describe('4. Input Validation & Error Handling', () => {
    it('throws BsaCertificateError when caseInfo has no caseId', () => {
      expect(() => {
        generateBsaSection63CertificateDraft({
          caseInfo: { caseId: '', title: 'Test' },
          evidenceItems: sampleEvidenceItems,
        });
      }).toThrow(BsaCertificateError);
    });

    it('throws BsaCertificateError when evidenceItems array is empty', () => {
      expect(() => {
        generateBsaSection63CertificateDraft({
          caseInfo: sampleCase,
          evidenceItems: [],
        });
      }).toThrow('Cannot generate Section 63 certificate without at least one evidence item.');
    });

    it('throws BsaCertificateError when an evidence item has an invalid SHA-256 hash', () => {
      expect(() => {
        generateBsaSection63CertificateDraft({
          caseInfo: sampleCase,
          evidenceItems: [
            {
              evidenceId: 'ev-bad-hash',
              originalFilename: 'bad.png',
              sha256: 'too-short',
            },
          ],
        });
      }).toThrow('invalid SHA-256 hash');
    });
  });

  describe('5. Curated Statutory Sources Verification', () => {
    it('provides verified statutory provenance for BSA 2023, IT Act, and BNS provisions', () => {
      expect(CURATED_STATUTORY_SOURCES['BSA_2023_SEC_63']).toBeDefined();
      expect(CURATED_STATUTORY_SOURCES['BSA_2023_SEC_63'].enactmentDate).toBe('2023-12-25');
      expect(CURATED_STATUTORY_SOURCES['BSA_2023_SEC_63'].effectiveDate).toBe('2024-07-01');
      expect(CURATED_STATUTORY_SOURCES['BSA_2023_SEC_63'].actNumber).toBe('Act No. 47 of 2023');

      expect(CURATED_STATUTORY_SOURCES['BSA_2023_SCHEDULE']).toBeDefined();
      expect(CURATED_STATUTORY_SOURCES['IT_ACT_2000_SEC_66E']).toBeDefined();
      expect(CURATED_STATUTORY_SOURCES['BNS_2023_SEC_78']).toBeDefined();
    });
  });

  describe('6. Dossier Packaging Integration (Module I & K)', () => {
    let storage: LocalStorageAdapter;

    beforeEach(async () => {
      storage = new LocalStorageAdapter(TEST_STORAGE_DIR);
    });

    afterEach(async () => {
      try {
        await fsp.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
      } catch {
        // Ignore cleanup
      }
    });

    it('bundles the Section 63 certificate draft inside the exported dossier ZIP and passes verification', async () => {
      const caseId = 'case-dossier-bsa-001';
      const evId = 'ev-png-dossier-bsa';
      const samplePng = Buffer.from('RAW_EVIDENCE_PNG_BYTES_FOR_DOSSIER');
      const sha256 = hashBuffer(samplePng).sha256Hex;

      await storage.writeStagedBuffer(getRawKey(caseId, evId), samplePng);

      const keyPair = generateEd25519KeyPair({ keyId: 'veratrace-ed25519-2026-q4' });

      // Generate Section 63 draft
      const certDraft = generateBsaSection63CertificateDraft({
        caseInfo: { caseId, title: 'Integrated Dossier Case' },
        evidenceItems: [
          {
            evidenceId: evId,
            originalFilename: 'evidence.png',
            fileSizeBytes: samplePng.length,
            sha256,
          },
        ],
        partAInput: completePartAInput,
      });

      // Package dossier with certificate draft
      const packagingResult = await packageDossier(
        {
          caseId,
          title: 'Integrated Dossier Case',
          category: 'HARASSMENT_STALKING',
        },
        [
          {
            evidenceId: evId,
            originalFilename: 'evidence.png',
            mediaType: 'image/png',
            sizeBytes: samplePng.length,
            sha256,
          },
        ],
        {
          storageAdapter: storage,
          signingPrivateKeyPem: keyPair.privateKeyPem,
          signingKeyId: keyPair.keyId,
          bsaCertificateDraft: certDraft,
        }
      );

      // Verify certificate is in inventory
      const certInventoryEntry = packagingResult.index.archiveInventory.find(
        (e) => e.path === 'legal/bsa_section_63_certificate.json'
      );
      expect(certInventoryEntry).toBeDefined();
      expect(certInventoryEntry?.role).toBe('STATUTORY_CERTIFICATE');

      // Verify the generated ZIP directly via offline verifier
      const zipKey = getDossierKey(caseId, packagingResult.dossierId, 'zip');
      const zipBuffer = await storage.readBuffer(zipKey);

      const report = await verifyDossierZipArchiveOffline(zipBuffer, {
        trustedKeyset: createPublicKeyset([keyPair.keyEntry]),
      });

      expect(report.overallStatus).toBe('MATCH');
      expect(report.archiveValid).toBe(true);
      expect(report.signatureValid).toBe(true);
      // Confirm legal/bsa_section_63_certificate.json is recognized as auxiliary and NOT flagged as unexpected
      expect(report.unexpectedFilesCount).toBe(0);
    });

    it('rejects packaging when certificate draft caseId does not match dossier caseId', async () => {
      const caseId = 'case-dossier-001';
      const evId = 'ev-png-001';
      const samplePng = Buffer.from('RAW_DATA');

      await storage.writeStagedBuffer(getRawKey(caseId, evId), samplePng);

      const certDraft = generateBsaSection63CertificateDraft({
        caseInfo: { caseId: 'DIFFERENT_CASE_ID', title: 'Mismatched Case' },
        evidenceItems: [
          {
            evidenceId: evId,
            originalFilename: 'evidence.png',
            fileSizeBytes: samplePng.length,
            sha256: hashBuffer(samplePng).sha256Hex,
          },
        ],
      });

      await expect(
        packageDossier(
          { caseId, title: 'Main Case', category: 'ONLINE_FRAUD' },
          [
            {
              evidenceId: evId,
              originalFilename: 'evidence.png',
              mediaType: 'image/png',
              sizeBytes: samplePng.length,
              sha256: hashBuffer(samplePng).sha256Hex,
            },
          ],
          {
            storageAdapter: storage,
            bsaCertificateDraft: certDraft,
          }
        )
      ).rejects.toThrow('Section 63 certificate caseId');
    });
  });
});
