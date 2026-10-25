import { useMemo } from 'react';
import { ChevronRight, Download, FileSearch, Layers, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Tooltip } from '../components/ui/Tooltip';
import { TimelineTable } from '../components/Timeline';
import { useVera } from '../store/VeraStore';
import { useToast } from '../store/ToastProvider';
import {
  CASE_STATUS_LABEL,
  VERIFICATION_LABEL,
  fileKind,
  formatBytes,
  formatStamp,
  hashBlocks,
} from '../lib/format';

function Section({ title, number, children, breakBefore = false }) {
  return (
    <section
      className="mt-14 first:mt-0"
      data-print={breakBefore ? 'break-before' : 'section'}
      aria-labelledby={`section-${number}`}
    >
      <div className="flex items-baseline gap-3 border-b border-lilac pb-3">
        <span className="mono text-[0.6875rem] text-muted">{number}</span>
        <h2 id={`section-${number}`} className="display-md text-plum print-ink">
          {title}
        </h2>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function Dossier() {
  const { caseId } = useParams();
  const { getCase, getEvidence, getTimeline } = useVera();
  const toast = useToast();

  const record = getCase(caseId);
  const evidence = getEvidence(caseId);
  const events = getTimeline(caseId);

  const evidenceById = useMemo(
    () => Object.fromEntries(evidence.map((item) => [item.evidenceId, item])),
    [evidence],
  );

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

  const uncertain = events.filter((e) => e.timeConfidence === 'uncertain' || !e.occurredAt).length;

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

      {/* Actions, and only the actions, disappear on paper. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-lilac pb-8" data-print="hide">
        <Button variant="primary" onClick={() => window.print()}>
          <Printer aria-hidden="true" strokeWidth={1.5} className="size-4" />
          Print / Save as PDF
        </Button>
        <Button variant="secondary" onClick={downloadIntegrityReport}>
          <Download aria-hidden="true" strokeWidth={1.5} className="size-4" />
          Integrity report (.json)
        </Button>
        <Tooltip label="Bundling the original files needs a server. This demo keeps every file on your device, so there is nothing to zip.">
          <span className="inline-flex">
            <Button variant="ghost" disabled aria-disabled="true">
              <Layers aria-hidden="true" strokeWidth={1.5} className="size-4" />
              Evidence ZIP
              <span className="mono ml-1 rounded-xs border border-lilac px-1 py-px text-[0.5625rem] tracking-[0.08em] uppercase">
                Coming with backend
              </span>
            </Button>
          </span>
        </Tooltip>
      </div>

      <article className="pt-10">
        {/* ── Cover block */}
        <header data-print="section">
          <p className="mono text-[0.625rem] tracking-[0.16em] text-muted uppercase">
            VeraTrace · Case dossier
          </p>
          <h1 className="display-lg mt-6 max-w-[30ch] text-plum print-ink">{record.title}</h1>

          <dl className="mono mt-8 grid gap-x-8 gap-y-2.5 text-[0.6875rem] sm:grid-cols-2">
            <div className="flex justify-between gap-4 border-b border-lilac/70 pb-2">
              <dt className="text-muted">Case ID</dt>
              <dd className="text-plum print-ink">{record.caseId}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-lilac/70 pb-2">
              <dt className="text-muted">Status</dt>
              <dd className="text-plum print-ink">{CASE_STATUS_LABEL[record.status] || record.status}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-lilac/70 pb-2">
              <dt className="text-muted">Opened</dt>
              <dd className="text-plum print-ink">{formatStamp(record.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-lilac/70 pb-2">
              <dt className="text-muted">Last updated</dt>
              <dd className="text-plum print-ink">{formatStamp(record.updatedAt)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-lilac/70 pb-2">
              <dt className="text-muted">Sealed files</dt>
              <dd className="text-plum print-ink">{evidence.length}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-lilac/70 pb-2">
              <dt className="text-muted">Prepared</dt>
              <dd className="text-plum print-ink">{formatStamp(preparedAt)}</dd>
            </div>
          </dl>
        </header>

        {/* ── 1 · Summary */}
        <Section number="01" title="Case summary">
          <p className="max-w-prose text-[0.9375rem] leading-relaxed text-plum print-ink">
            {record.summary || 'No summary has been written for this case.'}
          </p>
          <p className="mt-4 max-w-prose text-[0.8125rem] leading-relaxed text-muted">
            This dossier contains {evidence.length} sealed {evidence.length === 1 ? 'file' : 'files'} and{' '}
            {events.length} timeline {events.length === 1 ? 'event' : 'events'}
            {uncertain ? `, of which ${uncertain} ${uncertain === 1 ? 'has' : 'have'} an uncertain date` : ''}. It
            was prepared by the person holding the record, not by an investigator.
          </p>
        </Section>

        {/* ── 2 · Timeline */}
        <Section number="02" title="Timeline of events">
          {events.length ? (
            <TimelineTable events={events} evidenceById={evidenceById} />
          ) : (
            <p className="text-sm text-muted">No events have been recorded for this case.</p>
          )}
        </Section>

        {/* ── 3 · Evidence index */}
        <Section number="03" title="Evidence index">
          {evidence.length ? (
            <ol className="space-y-5">
              {evidence.map((item, index) => (
                <li
                  key={item.evidenceId}
                  className="grid gap-x-6 gap-y-1 border-b border-lilac/70 pb-5 sm:grid-cols-[2rem_1fr]"
                  data-print="section"
                >
                  <span className="mono text-[0.6875rem] text-muted">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-plum print-ink">{item.fileName}</p>
                    <p className="mono mt-1.5 text-[0.6875rem] leading-relaxed text-muted">
                      {item.evidenceId} · {fileKind(item.mimeType, item.fileName)} ·{' '}
                      {formatBytes(item.sizeBytes)} · recorded {formatStamp(item.recordedAt)} ·{' '}
                      {VERIFICATION_LABEL[item.verificationStatus]}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">No files have been sealed in this case.</p>
          )}
        </Section>

        {/* ── 4 · Integrity table */}
        <Section number="04" title="Integrity table" breakBefore>
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
                    <th scope="col" className="eyebrow py-2 font-semibold">
                      SHA-256
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {evidence.map((item) => (
                    <tr key={item.evidenceId} className="border-b border-lilac/70 align-top">
                      <td className="mono py-3 pr-4 text-[0.6875rem] whitespace-nowrap text-plum print-ink">
                        {item.evidenceId}
                      </td>
                      <td className="mono py-3 text-[0.6875rem] leading-relaxed break-all text-plum print-ink">
                        {hashBlocks(item.sha256).join(' ')}
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

        {/* ── 5 · Honest limits */}
        <Section number="05" title="What this record does and does not show">
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

      <div className="mt-12 border-t border-lilac pt-8" data-print="hide">
        <Link
          to={`/case/${record.caseId}`}
          className="inline-flex min-h-11 items-center text-[0.8125rem] text-violet-deep underline decoration-lilac decoration-1 underline-offset-4 hover:decoration-violet"
        >
          Back to the case
        </Link>
      </div>
    </div>
  );
}
