import { describe, it, expect } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EvidenceWorkspace from '../../../src/pages/EvidenceWorkspace.jsx';
import CaseOverview from '../../../src/pages/CaseOverview.jsx';
import Dossier from '../../../src/pages/Dossier.jsx';
import { syncEvidenceRecord, clearEvidenceForCase, VerificationStatus } from '../../../src/services/evidenceService.js';
import { addTimelineEventForCase, clearTimelineForCase } from '../../../src/services/timelineService.js';

describe('Evidence & Timeline UI Integration', () => {
  const caseId = 'case_1001';

  it('renders EvidenceWorkspace with dropzone, file input, filters and evidence records', () => {
    clearEvidenceForCase(caseId);

    // Populate live evidence
    syncEvidenceRecord(caseId, {
      evidenceId: 'ev_live_1',
      caseId,
      fileName: 'recorded-threat.png',
      originalFilename: 'recorded-threat.png',
      mimeType: 'image/png',
      sizeBytes: 104_857,
      recordedAt: '2026-10-20T12:00:00.000Z',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      verificationStatus: VerificationStatus.MATCH,
      storageKey: `cases/${caseId}/raw/ev_live_1`,
      intakeStatus: 'PROMOTED',
    });

    const html = ReactDOMServer.renderToString(
      <MemoryRouter initialEntries={[`/case/${caseId}/evidence`]}>
        <Routes>
          <Route path="/case/:caseId/evidence" element={<EvidenceWorkspace />} />
        </Routes>
      </MemoryRouter>
    );

    // Verify critical UI elements
    expect(html).toContain('Evidence');
    expect(html).toContain('Choose files');
    expect(html).toContain('Add evidence to this case');
    expect(html).toContain('recorded-threat.png');
    expect(html).toContain('e3b0c44298fc'); // Hash preview in cell
    expect(html).toContain('Verified'); // StatusChip
    expect(html).toContain('type="file"'); // Hidden input for upload
  });

  it('renders CaseOverview with timeline events and evidence summary', () => {
    clearTimelineForCase(caseId);

    addTimelineEventForCase(caseId, {
      caseId,
      label: 'Initial harassment report submitted',
      occurredAt: '2026-10-15T09:30:00.000Z',
      timeConfidence: 'confirmed',
    });

    addTimelineEventForCase(caseId, {
      caseId,
      label: 'Approximate phone call timestamp',
      occurredAt: null,
      timeConfidence: 'uncertain',
    });

    const html = ReactDOMServer.renderToString(
      <MemoryRouter initialEntries={[`/case/${caseId}`]}>
        <Routes>
          <Route path="/case/:caseId" element={<CaseOverview />} />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Timeline');
    expect(html).toContain('Initial harassment report submitted');
    expect(html).toContain('Approximate phone call timestamp');
    expect(html).toContain('Uncertain'); // CircleHelp badge for approximate timestamp
    expect(html).toContain('Open evidence workspace');
    expect(html).toContain('Add evidence');
  });

  it('renders Dossier reflecting synchronized live evidence and chronological timeline', () => {
    const html = ReactDOMServer.renderToString(
      <MemoryRouter initialEntries={[`/case/${caseId}/dossier`]}>
        <Routes>
          <Route path="/case/:caseId/dossier" element={<Dossier />} />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Case dossier');
    expect(html).toContain('Timeline of events');
    expect(html).toContain('Evidence index');
    expect(html).toContain('Integrity');
    expect(html).toContain('recorded-threat.png');
    expect(html).toContain('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});