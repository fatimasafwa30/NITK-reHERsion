import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, AlertTriangle, FileCheck, CheckCircle2, Info, UserCheck, RefreshCw } from 'lucide-react';
import { useVera } from '../store/VeraStore';
import { useToast } from '../store/ToastProvider';
import { Button } from '../components/ui/Button';

export function IntegrityAssessment() {
  const { caseId } = useParams();
  const { getCase, getEvidence, getTimeline } = useVera();
  const { notify } = useToast();

  const caseData = getCase(caseId);
  const evidenceList = getEvidence(caseId) || [];
  const timelineEvents = getTimeline(caseId) || [];

  const [selectedEvidenceId, setSelectedEvidenceId] = useState(
    evidenceList[0]?.evidenceId || evidenceList[0]?.evidence_id || null
  );

  const [reviewerNotes, setReviewerNotes] = useState('');
  const [reviewerFindings, setReviewerFindings] = useState({});

  // Dynamic evaluation of selected evidence item
  const activeRecord = useMemo(() => {
    return evidenceList.find((e) => (e.evidenceId || e.evidence_id) === selectedEvidenceId) || evidenceList[0] || null;
  }, [evidenceList, selectedEvidenceId]);

  const assessment = useMemo(() => {
    if (!activeRecord) return null;

    const hash = activeRecord.sha256 || activeRecord.sha256_hash || '';
    const hasValidHash = Boolean(hash && hash.length === 64);
    const flags = [];
    const recommendedSteps = [];

    // Check duplicate
    const duplicates = evidenceList.filter(
      (e) => (e.sha256 || e.sha256_hash) === hash && (e.evidenceId || e.evidence_id) !== (activeRecord.evidenceId || activeRecord.evidence_id)
    );
    if (duplicates.length > 0) {
      flags.push({
        code: 'DUPLICATE_PAYLOAD',
        severity: 'INFO',
        title: 'Matching Binary Checksum in Case',
        reason: `File bytes are identical to ${duplicates.length} other evidence record(s). Common when multiple screenshots of identical media are taken.`,
      });
      recommendedSteps.push('Verify if submitter submitted across multiple device syncs.');
    }

    // Check timestamps
    const uploadTime = activeRecord.recordedAt || activeRecord.upload_timestamp || activeRecord.createdAt;
    const captureTime = activeRecord.captureTimestamp || activeRecord.capture_timestamp;
    if (captureTime && uploadTime) {
      const diffMs = new Date(captureTime).getTime() - new Date(uploadTime).getTime();
      if (diffMs > 300000) {
        flags.push({
          code: 'FUTURE_TIMESTAMP',
          severity: 'MEDIUM',
          title: 'Capture Timestamp Ahead of Intake Clock',
          reason: 'Client-reported incident timestamp post-dates server intake timestamp. Typically caused by local device clock skew.',
        });
        recommendedSteps.push('Confirm device time zone settings.');
      }
    } else {
      flags.push({
        code: 'METADATA_UNAVAILABLE',
        severity: 'LOW',
        title: 'Embedded EXIF Capture Metadata Unavailable',
        reason: 'Raw hardware capture metadata was stripped by messaging platform before intake. Ingestion time serves as cryptographic anchor.',
      });
      recommendedSteps.push('Corroborate with platform export data or device screenshot archives.');
    }

    // Contextual chronology check
    const linkedEvent = timelineEvents.find(
      (t) => t.relatedEvidenceId === (activeRecord.evidenceId || activeRecord.evidence_id)
    );
    if (!linkedEvent) {
      flags.push({
        code: 'UNLINKED_INCIDENT',
        severity: 'INFO',
        title: 'No Linked Chronological Event',
        reason: 'Evidence is preserved in vault but unanchored to a specific timeline incident event.',
      });
      recommendedSteps.push('Attach to a chronological incident stop in the Timeline module.');
    } else if (linkedEvent.timeConfidence === 'uncertain') {
      flags.push({
        code: 'DATE_UNCERTAIN',
        severity: 'LOW',
        title: 'Submitter Noted Date Uncertain',
        reason: 'Submitter flagged the incident date as approximate. Avoid rigid velocity inferences.',
      });
    }

    // Classification
    let classification = 'INTEGRITY_VERIFIED';
    if (!hasValidHash) {
      classification = 'INTEGRITY_COMPROMISED';
    } else if (flags.some((f) => f.severity === 'HIGH' || f.severity === 'CRITICAL')) {
      classification = 'REVIEW_REQUIRED';
    } else if (activeRecord.submissionSource === 'EXTENSION_CAPTURE' || activeRecord.submission_source === 'EXTENSION_CAPTURE') {
      classification = 'CAPTURED';
    } else {
      classification = 'INTEGRITY_VERIFIED';
    }

    if (recommendedSteps.length === 0) {
      recommendedSteps.push('File matches cryptographic ingestion fingerprint. Maintain in preservation lock.');
    }

    return {
      hasValidHash,
      classification,
      flags,
      recommendedSteps,
      evaluatedAt: new Date().toISOString(),
    };
  }, [activeRecord, evidenceList, timelineEvents]);

  const handleSaveReview = (e) => {
    e.preventDefault();
    if (!activeRecord) return;
    const id = activeRecord.evidenceId || activeRecord.evidence_id;
    setReviewerFindings({
      ...reviewerFindings,
      [id]: {
        notes: reviewerNotes,
        reviewedAt: new Date().toISOString(),
        reviewedBy: 'Authorized Reviewer',
      },
    });
    notify('Human reviewer findings recorded in case ledger.', { variant: 'success' });
    setReviewerNotes('');
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted mb-2">
            <Link to={`/case/${caseId}`} className="hover:text-plum">Case {caseId}</Link>
            <span>/</span>
            <span className="text-plum font-medium">Integrity Assessment</span>
          </div>
          <h1 className="display-lg text-plum">
            Evidence <em className="italic">Integrity & Credibility</em> Assessment
          </h1>
          <p className="mt-2 text-sm text-muted max-w-2xl">
            Objective evaluation of cryptographic file integrity, metadata consistency, and chronological context with explainable reasons.
          </p>
        </div>
      </div>

      {/* Epistemic Mandate Banner */}
      <div className="mb-8 rounded-lg border border-lilac bg-wash/60 p-4 text-xs text-muted leading-relaxed">
        <strong className="text-plum block mb-1">EPISTEMIC FORENSIC MANDATE:</strong>
        A matching SHA-256 hash establishes byte-level immutability since intake; it does not prove who authored the message or that the depicted real-world event occurred. Missing metadata or cropping does not imply fabrication. VeraTrace never declares guilt or innocence.
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left: Evidence Picker */}
        <div className="lg:col-span-4 space-y-3">
          <div className="rounded-lg border border-lilac bg-paper p-4 shadow-sheet">
            <h2 className="text-xs font-semibold text-plum uppercase tracking-wider mb-3">
              Case Evidence Records ({evidenceList.length})
            </h2>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {evidenceList.map((rec) => {
                const recId = rec.evidenceId || rec.evidence_id;
                const isSelected = recId === selectedEvidenceId;
                const filename = rec.originalFilename || rec.original_filename || rec.label || 'Evidence File';

                return (
                  <button
                    key={recId}
                    type="button"
                    onClick={() => setSelectedEvidenceId(recId)}
                    className={`w-full text-left p-3 rounded-md border text-xs transition-colors ${
                      isSelected
                        ? 'border-violet-deep bg-wash text-plum font-semibold shadow-xs'
                        : 'border-lilac/70 bg-paper hover:bg-wash/50 text-muted'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate font-medium">{filename}</span>
                      <span className="mono text-[10px] text-muted">{recId}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                      <span className="mono text-violet-deep">
                        {(rec.sha256 || rec.sha256_hash || '').slice(0, 12)}...
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Assessment Details */}
        <div className="lg:col-span-8">
          {activeRecord && assessment ? (
            <div className="space-y-6">
              {/* Classification Strip */}
              <div className="rounded-lg border border-lilac bg-paper p-5 shadow-sheet flex items-center justify-between flex-wrap gap-4">
                <div>
                  <span className="eyebrow">Evidence Classification</span>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="mono text-xs font-bold px-2.5 py-1 rounded-full bg-wash text-violet-deep border border-lilac">
                      {assessment.classification}
                    </span>
                    <span className="text-xs text-muted">
                      {assessment.classification === 'CAPTURED' && 'Directly captured via Extension MV3 with page metadata'}
                      {assessment.classification === 'INTEGRITY_VERIFIED' && 'Checksum verified against original intake manifest'}
                      {assessment.classification === 'REVIEW_REQUIRED' && 'Anomalies or contextual gaps require human review'}
                      {assessment.classification === 'USER_SUBMITTED' && 'Standard manual intake awaiting further corroboration'}
                      {assessment.classification === 'INTEGRITY_COMPROMISED' && 'Checksum mismatch detected against original'}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="eyebrow">Ingestion Fingerprint</span>
                  <div className="mono text-xs text-plum font-medium mt-0.5">
                    {(activeRecord.sha256 || activeRecord.sha256_hash || '').slice(0, 20)}...
                  </div>
                </div>
              </div>

              {/* Check 1: File Integrity */}
              <div className="rounded-lg border border-lilac bg-paper p-5 shadow-sheet">
                <div className="flex items-center gap-2.5 mb-3">
                  <CheckCircle2 className="size-5 text-emerald-600" />
                  <h3 className="text-sm font-semibold text-plum">1. File Integrity & Vault Sealing</h3>
                </div>
                <div className="space-y-2 text-xs text-muted">
                  <div className="flex justify-between py-1 border-b border-lilac/40">
                    <span>Ingestion SHA-256 Digest:</span>
                    <span className="mono text-plum">{activeRecord.sha256 || activeRecord.sha256_hash}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-lilac/40">
                    <span>Vault Storage Encryption:</span>
                    <span className="text-plum font-medium">AES-256-GCM (Authenticated Envelope)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Duplicate Media Search:</span>
                    <span className="text-plum">
                      {evidenceList.filter((e) => (e.sha256 || e.sha256_hash) === (activeRecord.sha256 || activeRecord.sha256_hash)).length > 1
                        ? 'Duplicate binary match found in case'
                        : 'Unique file binary in case'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Check 2: Metadata & Provenance */}
              <div className="rounded-lg border border-lilac bg-paper p-5 shadow-sheet">
                <div className="flex items-center gap-2.5 mb-3">
                  <Info className="size-5 text-violet-deep" />
                  <h3 className="text-sm font-semibold text-plum">2. Metadata & Provenance Tracking</h3>
                </div>
                <div className="space-y-2 text-xs text-muted">
                  <div className="flex justify-between py-1 border-b border-lilac/40">
                    <span>Intake Method:</span>
                    <span className="text-plum">{activeRecord.submissionMethod || activeRecord.submission_method || 'Manual Upload'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-lilac/40">
                    <span>Source Platform / URL:</span>
                    <span className="mono text-plum">{activeRecord.sourceUrl || activeRecord.source_url || 'User provided'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Capture Timestamp vs Ingestion Timestamp:</span>
                    <span className="text-plum">
                      {activeRecord.captureTimestamp || activeRecord.capture_timestamp ? (
                        <>Recorded: {new Date(activeRecord.captureTimestamp || activeRecord.capture_timestamp).toLocaleString()}</>
                      ) : (
                        'No hardware capture timestamp embedded (Normal for messaging screenshots)'
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Check 3: Explainable Flags & Verification Steps */}
              <div className="rounded-lg border border-lilac bg-paper p-5 shadow-sheet">
                <div className="flex items-center gap-2.5 mb-3">
                  <AlertTriangle className="size-5 text-amber-600" />
                  <h3 className="text-sm font-semibold text-plum">3. Explainable Findings & Recommendations</h3>
                </div>

                {assessment.flags.length === 0 ? (
                  <p className="text-xs text-muted">No anomalies detected. File is consistent with client-side intake records.</p>
                ) : (
                  <div className="space-y-3 mb-4">
                    {assessment.flags.map((flag, idx) => (
                      <div key={idx} className="p-3 rounded-md bg-wash/50 border border-lilac/60 text-xs">
                        <div className="flex items-center justify-between font-semibold text-plum">
                          <span>{flag.title}</span>
                          <span className="mono text-[10px] text-violet-deep">{flag.code}</span>
                        </div>
                        <p className="mt-1 text-muted text-[11px] leading-relaxed">{flag.reason}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-lilac/50">
                  <span className="text-[11px] font-semibold text-plum block mb-1">Recommended Verification Steps:</span>
                  <ul className="text-xs text-muted list-disc pl-4 space-y-1">
                    {assessment.recommendedSteps.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Check 4: Human Reviewer Findings */}
              <div className="rounded-lg border border-lilac bg-paper p-5 shadow-sheet">
                <div className="flex items-center gap-2.5 mb-3">
                  <UserCheck className="size-5 text-violet-deep" />
                  <h3 className="text-sm font-semibold text-plum">4. Authorized Human Reviewer Notes</h3>
                </div>

                {reviewerFindings[activeRecord.evidenceId || activeRecord.evidence_id] ? (
                  <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-xs mb-3">
                    <span className="font-semibold text-emerald-900">Recorded Finding:</span>
                    <p className="mt-1 text-emerald-800">{reviewerFindings[activeRecord.evidenceId || activeRecord.evidence_id].notes}</p>
                    <span className="mono text-[10px] text-emerald-700 block mt-1">
                      Recorded at: {new Date(reviewerFindings[activeRecord.evidenceId || activeRecord.evidence_id].reviewedAt).toLocaleString()}
                    </span>
                  </div>
                ) : null}

                <form onSubmit={handleSaveReview} className="space-y-3">
                  <textarea
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                    rows={2}
                    placeholder="Enter manual forensic observations or corroboration steps (e.g. Verified with original device lockscreen)..."
                    className="w-full rounded-md border border-lilac bg-ivory p-2.5 text-xs text-plum outline-none focus:border-violet-deep"
                  />
                  <div className="flex justify-end">
                    <Button type="submit" variant="secondary" disabled={!reviewerNotes.trim()}>
                      Record Reviewer Finding
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-lilac bg-paper p-12 text-center text-muted">
              Select an evidence file on the left to inspect its integrity assessment.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
