import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  getEvidenceRegister,
  getTimelineForCase,
  addTimelineEventForCase,
} from '../../../src/services/evidenceStore.js';
import { LocalStorageAdapter } from '../../../src/lib/storage/index.js';
// @ts-ignore
import { useTimelineForCase } from '../../../src/hooks/useTimelineForCase.js';

describe('Services: Timeline Integration & Frontend Seams', () => {
  let tempStorageDir: string;
  let storageAdapter: LocalStorageAdapter;

  beforeEach(async () => {
    tempStorageDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veratrace-timeline-test-'));
    storageAdapter = new LocalStorageAdapter(tempStorageDir);
  });

  afterEach(async () => {
    await fsp.rm(tempStorageDir, { recursive: true, force: true }).catch(() => {});
  });

  it('adds user incident events to a case and returns chronological timeline', () => {
    const caseId = 'case_integration_1';
    const register = getEvidenceRegister(caseId, storageAdapter);

    register.addIncidentEvent({
      caseId,
      label: 'Harassing call received',
      occurredAt: '2026-10-01T14:00:00.000Z',
    });

    register.addIncidentEvent({
      caseId,
      label: 'Initial threat on Instagram',
      occurredAt: '2026-09-20T10:00:00.000Z',
    });

    const timeline = register.getTimeline();

    expect(timeline).toHaveLength(2);
    // Chronological order: Sept 20 before Oct 1
    expect(timeline[0].label).toBe('Initial threat on Instagram');
    expect(timeline[1].label).toBe('Harassing call received');
  });

  it('combines newly ingested evidence records and incident events into one timeline', async () => {
    const caseId = 'case_combined_timeline';
    const register = getEvidenceRegister(caseId, storageAdapter);

    // 1. Add an incident event
    register.addIncidentEvent({
      caseId,
      eventId: 'tl_event_1',
      label: 'Unsolicited phone call',
      occurredAt: '2026-09-10T11:00:00.000Z',
    });

    // 2. Add an evidence item (PNG)
    const validPng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
      0xae, 0x42, 0x60, 0x82,
    ]);

    const record = await register.addRecord({
      name: 'screenshot.png',
      buffer: validPng,
    });

    const timeline = getTimelineForCase(caseId);

    // Both the incident event and the preserved evidence milestone appear
    expect(timeline.length).toBeGreaterThanOrEqual(2);
    expect(timeline.some((t) => t.label === 'Unsolicited phone call')).toBe(true);
    expect(timeline.some((t) => t.relatedEvidenceId === record.evidenceId)).toBe(true);
  });

  it('integrates seamlessly with Person 1 useTimelineForCase hook', () => {
    const caseId = 'case_hook_test';

    // Before any events added, returns fallback
    const initialHookResult = useTimelineForCase(caseId);
    expect(initialHookResult.loading).toBe(false);

    // Add an event via addTimelineEventForCase
    addTimelineEventForCase(caseId, {
      caseId,
      label: 'Real incident logged via hook seam',
      occurredAt: '2026-10-15T18:00:00.000Z',
    });

    // After adding, hook returns real timeline data!
    const updatedHookResult = useTimelineForCase(caseId);
    expect(updatedHookResult.data).toHaveLength(1);
    const item0 = (updatedHookResult.data as any[])[0];
    expect(item0.label).toBe('Real incident logged via hook seam');
    expect(item0.occurredAt).toBe('2026-10-15T18:00:00.000Z');
  });

  it('falls back to mock data for mock cases when real timeline is unpopulated', () => {
    // case_1001 is a mock case from mockTimeline.js
    const mockResult = useTimelineForCase('case_1001');
    expect(mockResult.data.length).toBeGreaterThan(0);
    const mockItem0 = (mockResult.data as any[])[0];
    expect(mockItem0.label).toBe('First unwanted message received');
  });
});
