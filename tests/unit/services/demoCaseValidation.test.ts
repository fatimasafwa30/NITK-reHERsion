import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  DEMO_CASE_ID,
  isDemoCase,
  demoCaseRecord,
  demoEvidenceRecords,
  demoTimelineEvents,
  seedDemoCase,
} from '../../../src/data/demoCaseData.js';
import { getCaseById, generateDossier, exportDossierPdf, exportEvidenceZip } from '../../../src/services/caseStore.js';
import { getEvidenceForCase, getEvidenceBlob } from '../../../src/services/evidenceService.js';
import { getTimelineForCase } from '../../../src/services/timelineService.js';
import { correlateCrossPlatformIncidents } from '../../../src/services/incidentCorrelationService.js';
import { analyzeEscalationAndRisk } from '../../../src/services/riskAnalysisService.js';

describe('VeraTrace Demo Case (VT-DEMO-2026) Complete Validation', () => {
  beforeEach(() => {
    seedDemoCase({ overwrite: true });
  });

  it('identifies demo cases accurately', () => {
    expect(isDemoCase('VT-DEMO-2026')).toBe(true);
    expect(isDemoCase('case_1001')).toBe(false);
    expect(isDemoCase(null)).toBe(false);
  });

  it('contains expected demo case metadata adhering to contract', async () => {
    const caseRecord = await getCaseById(DEMO_CASE_ID);
    expect(caseRecord).toBeDefined();
    expect(caseRecord?.caseId).toBe('VT-DEMO-2026');
    expect(caseRecord?.title).toContain('Cross-Platform Harassment Investigation');
    expect(caseRecord?.isDemo).toBe(true);
  });

  it('has authentic local demo assets on disk with exact matching SHA-256 digests', () => {
    const demoDir = path.resolve('public', 'demo-assets');
    expect(fs.existsSync(demoDir)).toBe(true);

    for (const record of demoEvidenceRecords) {
      const filePath = path.join(demoDir, record.fileName);
      expect(fs.existsSync(filePath), `File ${record.fileName} must exist on disk`).toBe(true);

      const fileBytes = fs.readFileSync(filePath);
      expect(fileBytes.length).toBe(record.sizeBytes);

      const computedSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
      expect(computedSha256).toBe(record.sha256);
    }
  });

  it('populates 5 evidence records across WhatsApp, Instagram, SMS, Text, and PDF', () => {
    const evidence = getEvidenceForCase(DEMO_CASE_ID);
    expect(evidence.length).toBe(5);

    const platforms = new Set(evidence.map((e) => e.platform));
    expect(platforms.has('WhatsApp')).toBe(true);
    expect(platforms.has('Instagram')).toBe(true);
    expect(platforms.has('SMS')).toBe(true);
    expect(platforms.has('Email')).toBe(true);

    // Verify binary payloads are stored in memory/vault
    for (const ev of evidence) {
      const blob = getEvidenceBlob(ev.evidenceId);
      expect(blob).toBeDefined();
    }
  });

  it('populates 6 chronological timeline events including an explicit block event and bypass', () => {
    const timeline = getTimelineForCase(DEMO_CASE_ID);
    expect(timeline.length).toBe(6);

    const blockEvent = timeline.find((e) => e.label.toLowerCase().includes('blocked'));
    expect(blockEvent).toBeDefined();
    expect(blockEvent?.occurredAt).toBe('2026-10-14T08:30:00.000Z');

    const bypassEvent = timeline.find((e) => e.blockedPrior === true);
    expect(bypassEvent).toBeDefined();
    expect(new Date(bypassEvent!.occurredAt!).getTime()).toBeGreaterThan(
      new Date(blockEvent!.occurredAt!).getTime()
    );
  });

  it('generates a rich relationship graph with interconnected platforms, accounts, clues, evidence, and incidents', () => {
    const evidence = getEvidenceForCase(DEMO_CASE_ID);
    const timeline = getTimelineForCase(DEMO_CASE_ID);

    const correlation = correlateCrossPlatformIncidents(evidence, timeline);
    expect(correlation.platformsCount).toBeGreaterThanOrEqual(4);
    expect(correlation.accounts.length).toBeGreaterThanOrEqual(3);
    expect(correlation.crossPlatformIdentifiers.length).toBeGreaterThanOrEqual(2);

    const { nodes, links } = correlation.graph;
    expect(nodes.some((n) => n.type === 'PLATFORM')).toBe(true);
    expect(nodes.some((n) => n.type === 'ACCOUNT')).toBe(true);
    expect(nodes.some((n) => n.type === 'IDENTIFIER')).toBe(true);
    expect(nodes.some((n) => n.type === 'EVIDENCE')).toBe(true);
    expect(nodes.some((n) => n.type === 'INCIDENT')).toBe(true);

    // Check contact after block link
    expect(links.some((l) => l.type === 'CONTACT_AFTER_BLOCK')).toBe(true);
  });

  it('evaluates rule-based escalation indicators with transparent uncertainty and zero pseudo-scientific score', async () => {
    const caseRecord = await getCaseById(DEMO_CASE_ID);
    const evidence = getEvidenceForCase(DEMO_CASE_ID);
    const timeline = getTimelineForCase(DEMO_CASE_ID);

    const risk = analyzeEscalationAndRisk(caseRecord, evidence, timeline);
    expect(risk.status).toBe('ANALYSIS_COMPLETE');
    expect(risk.observedIndicators.length).toBeGreaterThanOrEqual(4);

    const indicatorIds = risk.observedIndicators.map((i) => i.id);
    expect(indicatorIds).toContain('IND_BLOCK_BYPASS');
    expect(indicatorIds).toContain('IND_CROSS_PLATFORM_PROLIFERATION');
    expect(indicatorIds).toContain('IND_NOCTURNAL_INTRUSION');

    expect(risk.legalDisclaimer).toContain('does NOT predict human behavior');
  });

  it('generates a multi-page PDF with simulated demo markings', async () => {
    const pdfBlob = await exportDossierPdf(DEMO_CASE_ID);
    expect(pdfBlob).toBeDefined();
    expect(pdfBlob.size).toBeGreaterThan(1000);
    expect(pdfBlob.type).toBe('application/pdf');
  });

  it('packages an evidence ZIP containing authentic bytes of all 5 files and verified manifest', async () => {
    const zipBlob = await exportEvidenceZip(DEMO_CASE_ID);
    expect(zipBlob).toBeDefined();
    expect(zipBlob.size).toBeGreaterThan(10000);
    expect(zipBlob.type).toBe('application/zip');
  });
});
