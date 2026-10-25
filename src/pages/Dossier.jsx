import { useMemo, useState, useEffect } from 'react';
import {
  Activity,
  ArrowRight,
  ChevronRight,
  Download,
  FileSearch,
  Layers,
  Printer,
  FileDown,
  ShieldCheck,
  AlertTriangle,
  Scale,
  ExternalLink,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Tooltip } from '../components/ui/Tooltip';
import { TimelineTable } from '../components/Timeline';
import { PatternAnalysis } from '../components/PatternAnalysis';
import { useVera } from '../store/VeraStore';
import { useToast } from '../store/ToastProvider';
import { mockCases } from '../data/mockCases';
import { getEvidenceForCase, checkEvidenceFileAvailable } from '../services/evidenceService';
import { getTimelineForCase } from '../services/timelineService';
import {
  CASE_STATUS_LABEL,
  VERIFICATION_LABEL,
  fileKind,
  formatBytes,
  formatStamp,
  hashBlocks,
} from '../lib/format';
import { exportDossierPdf, exportEvidenceZip } from '../services/caseStore';
import { isDemoCase } from '../data/demoCaseData';

function Section({ title, number, children, breakBefore = false, id }) {
  const sectionId = id || `section-${number}`;
  return (
    <section
      className="mt-14 first:mt-0"
      data-print={breakBefore ? 'break-before' : 'section'}
      aria-labelledby={sectionId}
    >
      <div className="flex items-baseline gap-3 border-b border-lilac pb-3">
        <span className="mono text-[0.6875rem] text-muted">{number}</span>
        <h2 id={sectionId} className="display-md text-plum print-ink">
          {title}
        </h2>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function Dossier() {
  const { caseId } = useParams();

  let vera = null;
  try {
    vera = useVera();
  } catch {
    vera = null;
  }

  let toast = () => {};
  try {
    toast = useToast();
  } catch {
    toast = () => {};
  }

  const record =
    vera?.getCase(caseId) ||
    mockCases.find((c) => c.caseId === caseId) ||
    (caseId ? { caseId, title: 'Case Record', status: 'OPEN', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), summary: '' } : null);

  const evidenceFromStore = vera?.getEvidence(caseId) || [];
  const serviceEvidence = caseId ? getEvidenceForCase(caseId) : [];
  const evidence = evidenceFromStore.length > 0 ? evidenceFromStore : serviceEvidence;

  const timelineFromStore = vera?.getTimeline(caseId) || [];
  const serviceTimeline = caseId ? getTimelineForCase(caseId) : [];
  const allEvents = [...timelineFromStore, ...serviceTimeline];
  const seenEvents = new Set();
  const events = allEvents.filter((e) => {
    const key = e.eventId || `${e.label}_${e.occurredAt}`;
    if (seenEvents.has(key)) return false;
    seenEvents.add(key);
    return true;
  });

  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState(null);
  const [missingIds, setMissingIds] = useState(new Set());

  useEffect(() => {
    let active = true;
    async function checkAvailability() {
      if (!evidence || evidence.length === 0) {
        if (active) setMissingIds(new Set());
        return;
      }
      const missing = new Set();
      for (const item of evidence) {
        const available = await checkEvidenceFileAvailable(item.evidenceId);
        if (!available) {
          missing.add(item.evidenceId);
        }
      }
      if (active) {
        setMissingIds(missing);
      }
    }
    checkAvailability();
    return () => {
      active = false;
    };
  }, [evidence]);

  const evidenceById = useMemo(
    () => Object.fromEntries(evidence.map((item) => [item.evidenceId, item])),
    [evidence],
  );

  const stats = useMemo(() => {
    const totalBytes = evidence.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
    const verifiedCount = evidence.filter((item) => item.verificationStatus === 'MATCH').length;
    const changedCount = evidence.filter((item) => item.verificationStatus === 'CHANGED').length;
    const unverifiedCount = evidence.length - verifiedCount - changedCount;
    return { totalBytes, verifiedCount, changedCount, unverifiedCount };
  }, [evidence]);

  if (!record) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-20 sm:px-8">
        <EmptyState
          icon={FileSearch}
          title="That case is not here"
          action={<Button to="/dashboard" variant="primary">Back to your cases</Button>}
        >
          <p>
            The case <span className="mono text-plum">{caseId}</span> is not in this browser.
          </p>
        </EmptyState>
      </div>
    );
  }

  const preparedAt = new Date().toISOString();
  const missingCount = missingIds.size;
  const uncertain = events.filter((e) => e.timeConfidence === 'uncertain' || !e.occurredAt).length;

  const handleDownloadPdf = async () => {
    if (!caseId) return;
    setIsDownloadingPdf(true);
    setDownloadNotice(null);
    try {
      const blob = await exportDossierPdf(caseId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VeraTrace_Dossier_${record.caseId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadNotice('Dossier PDF compiled and downloaded.');
      toast('Dossier PDF downloaded', { detail: `VeraTrace_Dossier_${record.caseId}.pdf` });
    } catch (err) {
      console.error('PDF export failure:', err);
      toast('Failed to generate PDF', { tone: 'error', detail: err.message });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!caseId) return;
    setIsDownloadingZip(true);
    setDownloadNotice(null);
    try {
      const blob = await exportEvidenceZip(caseId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VeraTrace_EvidenceVault_${record.caseId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadNotice(
        missingCount > 0
          ? `Evidence ZIP downloaded with warning: ${missingCount} file(s) unavailable in local vault.`
          : 'Evidence ZIP archive and signed manifest downloaded.'
      );
      toast('Evidence ZIP downloaded', { detail: `VeraTrace_EvidenceVault_${record.caseId}.zip` });
    } catch (err) {
      console.error('ZIP export failure:', err);
      toast('Failed to package evidence ZIP', { tone: 'error', detail: err.message });
    } finally {
      setIsDownloadingZip(false);
    }
  };

  /** Built from the same records the page shows — nothing is invented here. */
  const downloadIntegrityReport = () => {
    const report = {
      report: 'VeraTrace integrity report',
      preparedAt,
      note:
        'A matching SHA-256 hash shows a file has not changed since it was added. It does not establish authorship, the time of the events recorded, or admissibility.',
      case: {
        caseId: record.caseId,
        title: record.title,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        summary: record.summary,
      },
      evidence: evidence.map((item) => ({
        evidenceId: item.evidenceId,
        fileName: item.fileName,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        recordedAt: item.recordedAt,
        sha256: item.sha256,
        verificationStatus: item.verificationStatus,
      })),
      timeline: events.map((item) => ({
        eventId: item.eventId,
        occurredAt: item.occurredAt,
        timeConfidence: item.timeConfidence,
        label: item.label,
        relatedEvidenceId: item.relatedEvidenceId,
      })),
    };

    try {
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `veratrace-integrity-${record.caseId}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast('Integrity report downloaded', { detail: `veratrace-integrity-${record.caseId}.json` });
    } catch (error) {
      toast('Could not build the report', { tone: 'error', detail: error.message });
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <nav aria-label="Breadcrumb" className="mb-8" data-print="hide">
        <ol className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] text-muted">
          <li>
            <Link to="/dashboard" className="inline-flex min-h-11 items-center rounded-sm transition-colors hover:text-plum sm:min-h-0">
              Cases
            </Link>
          </li>
          <ChevronRight aria-hidden="true" strokeWidth={1.5} className="size-3.5 text-lilac" />
          <li className="min-w-0 max-w-[16ch] truncate sm:max-w-none">
            <Link to={`/case/${caseId}`} className="inline-flex min-h-11 items-center rounded-sm transition-colors hover:text-plum sm:min-h-0">
              {record.title}
            </Link>
          </li>
          <ChevronRight aria-hidden="true" strokeWidth={1.5} className="size-3.5 text-lilac" />
          <li aria-current="page" className="text-plum">
            Dossier
          </li>
        </ol>
      </nav>

      {(isDemoCase(caseId) || record.isDemo) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-900" data-print="hide">
          <div className="flex items-center gap-2">
            <span className="mono font-bold uppercase tracking-wider text-amber-800">Simulated Demo Case</span>
            <span className="text-amber-700/80">·</span>
            <span>This dossier compiles simulated training records. Not real-world legal evidence.</span>
          </div>
        </div>
      )}

      {/* Workflow Navigation Banner */}
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-lilac/70 bg-wash/50 px-4 py-3 text-xs text-plum" data-print="hide">
        <span className="mono font-semibold uppercase tracking-wider text-muted mr-1">Journey:</span>
        <Link to={`/case/${record.caseId}`} className="rounded px-2 py-0.5 text-muted hover:text-plum hover:bg-paper">
          1. Case Overview
        </Link>
        <ArrowRight className="size-3 text-lilac shrink-0" aria-hidden="true" />
        <Link to={`/case/${record.caseId}/evidence`} className="rounded px-2 py-0.5 text-muted hover:text-plum hover:bg-paper">
          2. Add Evidence
        </Link>
        <ArrowRight className="size-3 text-lilac shrink-0" aria-hidden="true" />
        <Link to={`/case/${record.caseId}/analysis`} className="rounded px-2 py-0.5 text-muted hover:text-plum hover:bg-paper">
          3. Analyse Patterns
        </Link>
        <ArrowRight className="size-3 text-lilac shrink-0" aria-hidden="true" />
        <span className="rounded border border-violet-deep/30 bg-paper px-2 py-0.5 font-semibold text-violet-deep shadow-xs">
          4. Export Dossier
        </span>
      </div>

      {missingCount > 0 && (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50/70 p-4 text-xs text-amber-900" data-print="hide">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 text-amber-600 shrink-0" />
            <span>Vault Storage Notice: {missingCount} file(s) unavailable in browser storage</span>
          </div>
          <p className="mt-1 text-amber-800 leading-relaxed">
            Some binary file payloads are missing from local IndexedDB vault storage. Their cryptographic hashes and timeline records remain preserved and verifiable.
          </p>
        </div>
      )}

      {downloadNotice && (
        <div className="mb-6 rounded-md border border-violet/30 bg-wash/80 p-3 text-xs text-violet-deep flex items-center justify-between" data-print="hide">
          <span>{downloadNotice}</span>
          <button onClick={() => setDownloadNotice(null)} className="text-xs font-semibold hover:underline">Dismiss</button>
        </div>
      )}

      {/* Dossier Header and Actions Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between" data-print="hide">
        <div>
          <p className="eyebrow">Case dossier</p>
          <h1 className="display-lg mt-2 text-plum">{record.title}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
          >
            {isDownloadingPdf ? (
              <Clock aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <FileDown aria-hidden="true" strokeWidth={1.5} className="size-4" />
            )}
            {isDownloadingPdf ? 'Compiling PDF…' : 'Download PDF'}
          </Button>

          <Button
            variant="secondary"
            onClick={handleDownloadZip}
            disabled={isDownloadingZip}
          >
            {isDownloadingZip ? (
              <Clock aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Layers aria-hidden="true" strokeWidth={1.5} className="size-4" />
            )}
            {isDownloadingZip ? 'Packaging ZIP…' : 'Download evidence ZIP'}
          </Button>

          <Tooltip label="Opens your browser's print dialog. Choose 'Save as PDF' if you prefer a print-style layout.">
            <Button
              variant="outline"
              onClick={() => window.print()}
              aria-label="Print or save as PDF"
              className="border-lilac text-plum hover:border-violet"
            >
              <Printer aria-hidden="true" strokeWidth={1.5} className="size-4" />
              Print
            </Button>
          </Tooltip>
        </div>
      </div>

      <hr className="rule my-8" data-print="hide" />

      {/* The printable document begins here. */}
      <article className="print-sheet">
        <header className="border-b-2 border-plum pb-6 print-ink">
          <p className="eyebrow">Case dossier</p>
          <h2 className="display-lg mt-2 text-plum print-ink">{record.title}</h2>
          <div className="mono mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>Case {record.caseId}</span>
            <span aria-hidden="true">·</span>
            <span>Status: {CASE_STATUS_LABEL[record.status] || record.status}</span>
            <span aria-hidden="true">·</span>
            <span>Prepared {formatStamp(preparedAt)}</span>
          </div>
        </header>

        {/* ── 1 · Summary */}
        <Section number="01" title="Case particulars">
          {record.summary ? (
            <p className="max-w-prose text-sm leading-relaxed text-plum print-ink">{record.summary}</p>
          ) : (
            <p className="text-sm italic text-muted">No summary was provided when the case was opened.</p>
          )}

          <dl className="mono mt-6 grid grid-cols-2 gap-4 border-t border-lilac pt-4 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted">Sealed files</dt>
              <dd className="mt-1 text-sm font-medium text-plum print-ink">{evidence.length}</dd>
            </div>
            <div>
              <dt className="text-muted">Total size</dt>
              <dd className="mt-1 text-sm font-medium text-plum print-ink">{formatBytes(stats.totalBytes)}</dd>
            </div>
            <div>
              <dt className="text-muted">Timeline events</dt>
              <dd className="mt-1 text-sm font-medium text-plum print-ink">{events.length}</dd>
            </div>
            <div>
              <dt className="text-muted">Uncertain dates</dt>
              <dd className="mt-1 text-sm font-medium text-plum print-ink">{uncertain}</dd>
            </div>
          </dl>
        </Section>

        {/* ── 2 · Verification summary */}
        <Section number="02" title="Integrity and verification status">
          <p className="max-w-prose text-sm leading-relaxed text-plum print-ink">
            A file in this dossier is verified only when its contents have been read again and compared to the
            SHA-256 hash recorded when it was added. If it has not been re-checked, it is listed as unverified.
          </p>

          <dl className="mono mt-6 grid grid-cols-3 gap-4 border-t border-lilac pt-4 text-xs">
            <div>
              <dt className="text-muted">Matching</dt>
              <dd className="mt-1 text-base font-medium text-plum print-ink">{stats.verifiedCount}</dd>
            </div>
            <div>
              <dt className="text-muted">Changed</dt>
              <dd className="mt-1 text-base font-medium text-plum print-ink">{stats.changedCount}</dd>
            </div>
            <div>
              <dt className="text-muted">Unverified</dt>
              <dd className="mt-1 text-base font-medium text-plum print-ink">{stats.unverifiedCount}</dd>
            </div>
          </dl>
        </Section>

        {/* ── 3 · Pattern Analysis */}
        <Section number="03" title="Cross-platform harassment pattern analysis">
          <p className="max-w-prose text-sm leading-relaxed text-plum print-ink mb-6">
            Multi-platform behavioral correlation, escalation risk evaluation, and account cross-referencing.
          </p>
          <PatternAnalysis caseRecord={record} evidence={evidence} timeline={events} />
        </Section>

        {/* ── 4 · Forensic Timeline */}
        <Section number="04" title="Timeline of events">
          {events.length ? (
            <TimelineTable events={events} evidenceById={evidenceById} />
          ) : (
            <p className="text-sm text-muted">No timeline entries have been recorded.</p>
          )}
        </Section>

        {/* ── 5 · Cryptographic Ledger */}
        <Section number="05" title="Evidence index" breakBefore>
          {evidence.length ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">
                  SHA-256 hash for each sealed file in this case, grouped in eight-character blocks.
                </caption>
                <thead>
                  <tr className="border-b border-lilac">
                    <th scope="col" className="eyebrow py-2 pr-4 font-semibold">
                      Evidence ID
                    </th>
                    <th scope="col" className="eyebrow py-2 pr-4 font-semibold">
                      File
                    </th>
                    <th scope="col" className="eyebrow py-2 font-semibold">
                      SHA-256
                    </th>
                    <th scope="col" className="eyebrow py-2 font-semibold">
                      Vault
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {evidence.map((item) => (
                    <tr key={item.evidenceId} className="border-b border-lilac/70 align-top">
                      <td className="mono py-3 pr-4 text-[0.6875rem] whitespace-nowrap text-plum print-ink">
                        {item.evidenceId}
                      </td>
                      <td className="py-3 pr-4 text-xs font-medium text-plum print-ink">
                        {item.fileName}
                      </td>
                      <td className="mono py-3 text-[0.6875rem] leading-relaxed break-all text-plum print-ink">
                        <span className="sr-only">{item.sha256}</span>
                        <span aria-hidden="true">{hashBlocks(item.sha256).join(' ')}</span>
                      </td>
                      <td className="mono py-3 pl-2 text-[0.6875rem] whitespace-nowrap text-muted">
                        {missingIds.has(item.evidenceId) ? 'Missing' : 'Preserved'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">There are no hashes to list.</p>
          )}
        </Section>

        {/* ── 6 · BSA Section 63 Certificate */}
        <Section number="06" title="Statutory Certificate Preparation (Bharatiya Sakshya Adhiniyam, 2023 Sec 63)">
          <div className="rounded-lg border border-lilac bg-paper p-6 text-plum print-ink">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-lilac pb-3">
              <h3 className="font-serif text-base font-semibold">Bharatiya Sakshya Adhiniyam, 2023 — Section 63 Draft</h3>
              <span className="mono rounded-xs border border-violet/40 bg-wash/80 px-2 py-0.5 text-[0.625rem] text-violet-deep">
                Draft for Verification
              </span>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Under Indian law (Bharatiya Sakshya Adhiniyam, 2023 Section 63), electronic evidence produced in court or to police
              must be accompanied by a signed certificate from the person in lawful control of the device.
              VeraTrace pre-fills the verifiable technical facts and provides designated blanks for physical certification.
            </p>
            <dl className="mono mt-4 grid gap-3 text-[0.6875rem] sm:grid-cols-2">
              <div className="rounded border border-lilac/70 bg-ivory/60 p-2.5">
                <dt className="text-muted">Software Engine</dt>
                <dd className="font-medium text-plum">VeraTrace Intake Engine v0.1.0-mvp</dd>
              </div>
              <div className="rounded border border-lilac/70 bg-ivory/60 p-2.5">
                <dt className="text-muted">Hashing Standard</dt>
                <dd className="font-medium text-plum">SHA-256 (FIPS 180-4 NIST Standard)</dd>
              </div>
              <div className="rounded border border-lilac/70 bg-ivory/60 p-2.5">
                <dt className="text-muted">Storage Model</dt>
                <dd className="font-medium text-plum">Client Vault (Private Device Storage)</dd>
              </div>
              <div className="rounded border border-lilac/70 bg-ivory/60 p-2.5">
                <dt className="text-muted">Case Identifier</dt>
                <dd className="font-medium text-plum">{record.caseId}</dd>
              </div>
            </dl>
            <p className="mt-4 border-t border-lilac/70 pt-3 text-xs leading-relaxed text-muted">
              <strong>Statutory Draft Notice:</strong> The exported PDF contains the complete Part A Section 63
              Certificate draft. Print the document, fill in your device particulars (Make, Model, Serial/IMEI),
              sign the statutory declaration, and attach it to your complaint. VeraTrace does not guarantee admissibility.
            </p>
          </div>
        </Section>

        {/* ── 7 · Cybercrime Portal Handoff */}
        <Section number="07" title="Official Cybercrime Complaint Submission">
          <div className="rounded-lg border border-lilac bg-paper p-6 text-plum print-ink">
            <h3 className="font-serif text-base font-semibold">National Cyber Crime Reporting Portal (Government of India)</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              VeraTrace is a private intake tool and does not automatically submit your case to police.
              To register a formal complaint with Indian cybercrime cells, submit your exported evidence through the
              official portal or dial the national helpline.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-lilac/70 pt-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-violet-deep">
                <Scale className="size-4" aria-hidden="true" />
                <span>National Cybercrime Helpline: 1930</span>
              </div>
              <a
                href="https://cybercrime.gov.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-lilac bg-wash px-3 text-xs font-medium text-plum transition-colors hover:border-violet hover:bg-wash/80"
              >
                Visit cybercrime.gov.in
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </Section>

        {/* ── 8 · Honest limits */}
        <Section number="08" title="What this record does and does not show">
          <div className="max-w-prose space-y-4 text-[0.9375rem] leading-relaxed text-plum print-ink">
            <p>
              Each hash above was computed from the bytes of the file at the moment it was added to this case. If a
              file still produces the same hash, it has not changed since then. That is the whole of what a
              matching hash establishes.
            </p>
            <p>
              It does not show who created a file, where it came from, or that the events described in it happened
              as described. The &ldquo;recorded&rdquo; times are the times this application saved each record; they
              are not independently witnessed, and they are not the times of the incidents themselves. Timeline
              entries marked <span className="mono text-[0.8125rem]">date uncertain</span> are the record-holder&rsquo;s
              best recollection and are labelled as such deliberately.
            </p>
            <p>
              Whether any of this is accepted as evidence is decided by courts, employers, platforms and police,
              not by this document. Anyone relying on it should seek advice from someone qualified to give it.
            </p>
          </div>
        </Section>

        <footer className="mt-14 border-t border-lilac pt-6" data-print="section">
          <p className="mono text-[0.625rem] leading-relaxed tracking-[0.1em] text-muted uppercase">
            VeraTrace · {record.caseId} · prepared {formatStamp(preparedAt)} · demonstration build
          </p>
        </footer>
      </article>

      {/* Bottom Export Action Card */}
      <div className="mt-12 rounded-lg border border-violet/30 bg-paper p-6 shadow-sheet" data-print="hide">
        <h3 className="font-serif text-base font-semibold text-plum">Export & Verification Complete</h3>
        <p className="mt-1 text-xs text-muted max-w-xl">
          Your dossier incorporates all sealed files, timestamps, cross-platform harassment correlations, and the Section 63 BSA certificate draft.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
          >
            {isDownloadingPdf ? (
              <Clock aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <FileDown aria-hidden="true" strokeWidth={1.5} className="size-4" />
            )}
            {isDownloadingPdf ? 'Compiling PDF…' : 'Export Dossier (Download PDF)'}
          </Button>
          <Button
            variant="secondary"
            onClick={handleDownloadZip}
            disabled={isDownloadingZip}
          >
            {isDownloadingZip ? (
              <Clock aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Layers aria-hidden="true" strokeWidth={1.5} className="size-4" />
            )}
            {isDownloadingZip ? 'Packaging ZIP…' : 'Download evidence ZIP'}
          </Button>
          <Button to={`/case/${caseId}/analysis`} variant="ghost">
            <Activity aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
            Review Pattern Analysis
          </Button>
        </div>
      </div>

      <div className="mt-8 border-t border-lilac pt-6" data-print="hide">
        <Link
          to={`/case/${record.caseId}`}
          className="inline-flex min-h-11 items-center text-[0.8125rem] text-violet-deep underline decoration-lilac decoration-1 underline-offset-4 hover:decoration-violet"
        >
          Back to case overview
        </Link>
      </div>
    </div>
  );
}

export default Dossier;
