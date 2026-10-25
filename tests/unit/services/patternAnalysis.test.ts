import { describe, it, expect } from 'vitest';
import {
  detectPlatform,
  analyzeHarassmentPattern,
  KNOWN_PLATFORMS,
} from '../../../src/services/patternAnalysisService.js';

describe('Cross-Platform Harassment Pattern Analysis Engine', () => {
  describe('detectPlatform heuristic detection', () => {
    it('identifies WhatsApp from filenames and claimed sources', () => {
      expect(detectPlatform('chat-screenshot-1.png').id).toBe('whatsapp');
      expect(detectPlatform('whatsapp_export_threat.txt').id).toBe('whatsapp');
      expect(detectPlatform('audio_note.opus').id).toBe('whatsapp');
    });

    it('identifies Instagram from mentions of insta, fake-profile, story, or DM', () => {
      expect(detectPlatform('fake-profile-screenshot.png').id).toBe('instagram');
      expect(detectPlatform('insta_dm_harassment.jpg').id).toBe('instagram');
    });

    it('identifies Email from email threads and messages', () => {
      expect(detectPlatform('email-thread.pdf').id).toBe('email');
      expect(detectPlatform('hostile_message.eml').id).toBe('email');
    });

    it('identifies Phone calls and voicemails', () => {
      expect(detectPlatform('Approximate phone call timestamp').id).toBe('phone');
      expect(detectPlatform('voicemail_threat.mp3').id).toBe('phone');
    });

    it('identifies Telegram', () => {
      expect(detectPlatform('tg_export_chat.pdf').id).toBe('telegram');
    });
  });

  describe('analyzeHarassmentPattern full case evaluation', () => {
    const mockCase = {
      caseId: 'case_pattern_test',
      title: 'Targeted Multi-Channel Harassment',
      summary: 'Ongoing unwanted contact across Instagram, WhatsApp, and workplace phone calls.',
    };

    const mockEvidence = [
      {
        evidenceId: 'ev_1',
        fileName: 'insta_dm_threat.png',
        userClaimedSource: 'Instagram DM',
        recordedAt: '2026-10-10T10:00:00.000Z',
      },
      {
        evidenceId: 'ev_2',
        fileName: 'chat-screenshot-whatsapp.png',
        userClaimedSource: 'WhatsApp Chat',
        recordedAt: '2026-10-11T23:30:00.000Z', // 23:30 is off-hours
      },
      {
        evidenceId: 'ev_3',
        fileName: 'email-thread.pdf',
        userClaimedSource: 'Work Email',
        recordedAt: '2026-10-12T02:15:00.000Z', // 02:15 is off-hours
      },
    ];

    const mockTimeline = [
      {
        eventId: 'tl_1',
        label: 'Initial harassment received on Instagram DM',
        occurredAt: '2026-10-10T10:00:00.000Z',
        timeConfidence: 'confirmed',
        relatedEvidenceId: 'ev_1',
      },
      {
        eventId: 'tl_2',
        label: 'Aggressor contacted on WhatsApp after being blocked on Instagram',
        occurredAt: '2026-10-11T23:30:00.000Z',
        timeConfidence: 'confirmed',
        relatedEvidenceId: 'ev_2',
      },
      {
        eventId: 'tl_3',
        label: 'Unwanted late-night email sent to workplace inbox',
        occurredAt: '2026-10-12T02:15:00.000Z',
        timeConfidence: 'confirmed',
        relatedEvidenceId: 'ev_3',
      },
    ];

    it('accurately identifies multi-platform footprint and platform count', () => {
      const result = analyzeHarassmentPattern(mockCase, mockEvidence, mockTimeline);

      expect(result.caseId).toBe('case_pattern_test');
      expect(result.isMultiPlatform).toBe(true);
      expect(result.distinctPlatformCount).toBeGreaterThanOrEqual(3);

      const platformIds = result.detectedPlatforms.map((p) => p.platform.id);
      expect(platformIds).toContain('instagram');
      expect(platformIds).toContain('whatsapp');
      expect(platformIds).toContain('email');
    });

    it('identifies chronological escalation hops across platforms', () => {
      const result = analyzeHarassmentPattern(mockCase, mockEvidence, mockTimeline);

      expect(result.escalationHops.length).toBeGreaterThanOrEqual(2);
      expect(result.escalationHops[0].platform.id).toBe('instagram');
      expect(result.escalationHops[1].platform.id).toBe('whatsapp');
    });

    it('flags off-hours nocturnal touchpoints and rapid burst velocity', () => {
      const result = analyzeHarassmentPattern(mockCase, mockEvidence, mockTimeline);

      expect(result.offHoursCount).toBe(2); // 23:30 and 02:15
      expect(result.burstDetected).toBe(true); // events occurred within 48 hours across platforms
      expect(result.timespanDays).toBe(2);
    });

    it('generates structured factual findings and legal disclaimer', () => {
      const result = analyzeHarassmentPattern(mockCase, mockEvidence, mockTimeline);

      expect(result.findings.length).toBeGreaterThanOrEqual(3);
      expect(result.findings.some((f) => f.type === 'MULTI_PLATFORM')).toBe(true);
      expect(result.findings.some((f) => f.type === 'CHANNEL_HOPPING')).toBe(true);
      expect(result.findings.some((f) => f.type === 'OFF_HOURS')).toBe(true);
      expect(result.disclaimer).toContain('verifiable facts');
    });
  });
});
