import { describe, it, expect } from 'vitest';
import {
  correlateCrossPlatformIncidents,
  normalizeIdentifier,
  extractIdentifiersFromText,
  LINK_CONFIDENCE,
} from '../../../src/services/incidentCorrelationService.js';
import {
  analyzeEscalationAndRisk,
  INDICATOR_SEVERITY,
  RISK_INDICATOR_DEFINITIONS,
} from '../../../src/services/riskAnalysisService.js';

describe('Cross-Platform Harassment Pattern & Risk Assessment Unit Tests', () => {
  const mockCase = {
    caseId: 'case_cpr_101',
    title: 'Cross-Platform Stalking & Coercion Investigation',
    summary: 'Targeted multi-channel harassment across WhatsApp, Instagram, and work email.',
  };

  describe('1. Repeated-Contact Detection & Identifier Extraction', () => {
    it('normalizes handles, phone numbers, and emails accurately', () => {
      expect(normalizeIdentifier('@Stalker_User_99')).toBe('stalker_user_99');
      expect(normalizeIdentifier('+91 98450 12345')).toBe('919845012345');
      expect(normalizeIdentifier('  anon.user@proton.me  ')).toBe('anon.user@proton.me');
    });

    it('extracts embedded phones, emails, and handles from free-form text notes', () => {
      const sampleText =
        'Contacted me via @shadow_operative and also sent threats to victim@corp.org from +1-555-019-2834.';
      const extracted = extractIdentifiersFromText(sampleText);

      expect(extracted).toContain('@shadow_operative');
      expect(extracted).toContain('victim@corp.org');
      expect(extracted.some((p) => p.includes('555'))).toBe(true);
    });

    it('aggregates repeated contact touchpoints across multiple accounts and files', () => {
      const evidence = [
        {
          evidenceId: 'ev_1',
          fileName: 'wa_threat_1.png',
          platform: 'WhatsApp',
          senderHandle: '+91 98450 11111',
          recordedAt: '2026-10-15T09:00:00.000Z',
        },
        {
          evidenceId: 'ev_2',
          fileName: 'wa_threat_2.png',
          platform: 'WhatsApp',
          senderHandle: '+91 98450 11111',
          recordedAt: '2026-10-16T10:00:00.000Z',
        },
      ];

      const correlation = correlateCrossPlatformIncidents(evidence, []);
      expect(correlation.accounts.length).toBe(1);
      expect(correlation.accounts[0].handle).toBe('+91 98450 11111');
      expect(correlation.accounts[0].sources.length).toBe(2);
    });
  });

  describe('2. Cross-Platform Incident Correlation & Relationship Graph', () => {
    it('detects cross-platform invasion across WhatsApp, Instagram, and Email', () => {
      const evidence = [
        {
          evidenceId: 'ev_wa',
          fileName: 'whatsapp_chat.png',
          platform: 'WhatsApp',
          senderHandle: '+91 99999 88888',
          sharedIdentifiers: ['stalker_root_phrase'],
          recordedAt: '2026-10-10T12:00:00.000Z',
        },
        {
          evidenceId: 'ev_ig',
          fileName: 'insta_dm.png',
          platform: 'Instagram',
          senderHandle: '@stalker_alt_ig',
          sharedIdentifiers: ['stalker_root_phrase'],
          blockedPrior: true,
          recordedAt: '2026-10-12T14:00:00.000Z',
        },
        {
          evidenceId: 'ev_mail',
          fileName: 'email_threat.pdf',
          platform: 'Email',
          senderHandle: 'stalker_root_phrase@proton.me',
          sharedIdentifiers: ['stalker_root_phrase'],
          recordedAt: '2026-10-14T02:00:00.000Z',
        },
      ];

      const correlation = correlateCrossPlatformIncidents(evidence, []);

      expect(correlation.platformsCount).toBe(3);
      expect(correlation.crossPlatformIdentifiers.length).toBeGreaterThanOrEqual(1);

      // Verify graph contains Platform, Account, and Identifier nodes
      const nodeTypes = new Set(correlation.graph.nodes.map((n) => n.type));
      expect(nodeTypes.has('PLATFORM')).toBe(true);
      expect(nodeTypes.has('ACCOUNT')).toBe(true);
      expect(nodeTypes.has('IDENTIFIER')).toBe(true);

      // Verify contact after block link
      const bypassLink = correlation.graph.links.find(
        (l) => l.type === 'CONTACT_AFTER_BLOCK',
      );
      expect(bypassLink).toBeDefined();
      expect(bypassLink?.confidence).toBe(LINK_CONFIDENCE.BEHAVIORAL_BYPASS);
    });

    it('treats shared identifiers as clues and displays appropriate epistemic notice', () => {
      const correlation = correlateCrossPlatformIncidents([], []);
      expect(correlation.epistemicNotice).toContain('clues, not definitive legal proof');
    });
  });

  describe('3. Escalating Language & Threat Coercion Detection', () => {
    it('flags coercion and blackmail language linked to source evidence', () => {
      const evidence = [
        {
          evidenceId: 'ev_coercion',
          fileName: 'blackmail_msg.png',
          notes: 'Threatening to leak private photos and ruin career if I do not pay money or reply.',
          incidentType: 'COERCION',
          recordedAt: '2026-10-18T11:00:00.000Z',
        },
        {
          evidenceId: 'ev_offline',
          fileName: 'commute_photo.png',
          notes: 'Photo taken of my office building outside work with message saying "saw you leave at 6 PM".',
          incidentType: 'OFFLINE_SURVEILLANCE',
          recordedAt: '2026-10-19T18:30:00.000Z',
        },
      ];

      const assessment = analyzeEscalationAndRisk(mockCase, evidence, []);

      expect(assessment.status).toBe('ANALYSIS_COMPLETE');
      expect(assessment.highSeverityCount).toBeGreaterThanOrEqual(2);

      const coercionInd = assessment.observedIndicators.find(
        (i) => i.id === 'IND_COERCION_EXTORTION',
      );
      expect(coercionInd).toBeDefined();
      expect(coercionInd?.severity).toBe(INDICATOR_SEVERITY.HIGH);
      expect(coercionInd?.supportingEvidence.length).toBe(1);
      expect(coercionInd?.supportingEvidence[0].evidenceId).toBe('ev_coercion');

      const surveillanceInd = assessment.observedIndicators.find(
        (i) => i.id === 'IND_OFFLINE_SURVEILLANCE',
      );
      expect(surveillanceInd).toBeDefined();
      expect(surveillanceInd?.supportingEvidence[0].evidenceId).toBe('ev_offline');
    });

    it('detects block bypass attempts when contact resumes from an alternate channel', () => {
      const evidence = [
        {
          evidenceId: 'ev_bypass',
          fileName: 'new_number_sms.png',
          notes: 'Sent from burner SIM after WhatsApp was blocked: "Why did you block me, you cannot hide".',
          blockedPrior: true,
          recordedAt: '2026-10-20T21:00:00.000Z',
        },
        {
          evidenceId: 'ev_prior',
          fileName: 'initial_wa.png',
          recordedAt: '2026-10-19T10:00:00.000Z',
        },
      ];

      const assessment = analyzeEscalationAndRisk(mockCase, evidence, []);
      const bypassInd = assessment.observedIndicators.find(
        (i) => i.id === 'IND_BLOCK_BYPASS',
      );
      expect(bypassInd).toBeDefined();
      expect(bypassInd?.supportingEvidence[0].evidenceId).toBe('ev_bypass');
    });
  });

  describe('4. Timestamp Uncertainty & Data Gaps Handling', () => {
    it('notes uncertain dates as investigative data gaps while maintaining chronological integrity', () => {
      const timeline = [
        {
          eventId: 'tl_conf',
          label: 'Formal complaint filed',
          occurredAt: '2026-10-21T10:00:00.000Z',
          timeConfidence: 'confirmed',
        },
        {
          eventId: 'tl_uncert',
          label: 'Verbal confrontation in elevator (approximate date)',
          occurredAt: null,
          timeConfidence: 'uncertain',
        },
      ];

      const assessment = analyzeEscalationAndRisk(mockCase, [], timeline);
      expect(assessment.dataGaps.some((g) => g.includes('uncertain'))).toBe(true);
    });
  });

  describe('5. Insufficient Evidence Handling', () => {
    it('transparently refuses to fabricate a pattern when evidence count < 2', () => {
      const singleItem = [
        {
          evidenceId: 'ev_single',
          fileName: 'lone_file.png',
          recordedAt: '2026-10-22T10:00:00.000Z',
        },
      ];

      const assessment = analyzeEscalationAndRisk(mockCase, singleItem, []);

      expect(assessment.status).toBe('INSUFFICIENT_DATA');
      expect(assessment.isSufficient).toBe(false);
      expect(assessment.observedIndicators.length).toBe(0);
      expect(assessment.summary).toContain('Insufficient evidence records');
      expect(assessment.safetyRecommendations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('6. Evidence Traceability & Safety Recommendations', () => {
    it('verifies every single indicator is linked to supporting evidence records', () => {
      const evidence = [
        {
          evidenceId: 'ev_test_1',
          fileName: 'threat_email.pdf',
          notes: 'Threatening to ruin career and leak photos',
          incidentType: 'COERCION',
          recordedAt: '2026-10-20T23:30:00.000Z', // Nocturnal
        },
        {
          evidenceId: 'ev_test_2',
          fileName: 'insta_contact.png',
          notes: 'Instagram DM request after being blocked on email',
          blockedPrior: true,
          recordedAt: '2026-10-21T01:15:00.000Z', // Nocturnal + Burst (< 48h)
        },
      ];

      const assessment = analyzeEscalationAndRisk(mockCase, evidence, []);

      // Verify every detected indicator has non-empty supporting evidence
      for (const indicator of assessment.observedIndicators) {
        expect(indicator.supportingEvidence.length).toBeGreaterThan(0);
        for (const sup of indicator.supportingEvidence) {
          expect(sup.evidenceId).toBeDefined();
          expect(sup.fileName).toBeDefined();
        }
      }

      // Verify supporting links table
      expect(assessment.supportingEvidenceLinks.length).toBeGreaterThan(0);

      // Verify safety recommendations include Cybercrime 1930 & cybercrime.gov.in
      const recDetails = assessment.safetyRecommendations.map((r) => r.detail).join(' ');
      expect(recDetails).toContain('1930');
      expect(recDetails).toContain('cybercrime.gov.in');
    });
  });
});
