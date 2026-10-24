import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCaseStore } from '../hooks/useCaseStore';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { formatDateTime, formatDate, formatBytes } from '../lib/utils';
import { Printer, Download, ArrowLeft, Shield, FileCheck, AlertCircle } from 'lucide-react';

export default function Dossier() {
  const { caseId } = useParams();
  const { getCase, getTimeline, getEvidence } = useCaseStore();

  const caseData = getCase(caseId);
  const timeline = getTimeline(caseId);
  const evidence = getEvidence(caseId);

  if (!caseData) {
    return (
      <EmptyState
        title="Case not found"
        description="The requested case dossier cannot be compiled."
        actionLabel="Back to Cases"
        onAction={() => window.location.href = '/dashboard'}
      />
    );
  }

  // Sorted timeline
  const sortedTimeline = [...timeline].sort((a, b) => {
    if (!a.occurredAt) return 1;
    if (!b.occurredAt) return -1;
    return new Date(a.occurredAt) - new Date(b.occurredAt);
  });

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Non-print action header */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <Link
          to={`/case/${caseId}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Return to case overview</span>
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative group">
            <Button
              variant="secondary"
              disabled
              className="gap-2 opacity-60 cursor-not-allowed text-xs"
              title="Packaging disabled in browser demo"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download ZIP archive</span>
            </Button>
            <span className="hidden group-hover:block absolute top-full mt-1.5 right-0 w-64 p-2 bg-ink text-white text-[11px] rounded shadow-lg z-10 leading-normal">
              ZIP packaging is disabled in this browser demo. Use Print to save as PDF.
            </span>
          </div>

          <Button onClick={() => window.print()} className="gap-2">
            <Printer className="w-4 h-4" aria-hidden="true" />
            <span>Print / Save as PDF</span>
          </Button>
        </div>
      </div>

      {/* Printable Dossier Document */}
      <article className="bg-surface border border-border p-8 sm:p-12 rounded-lg space-y-10 print:border-none print:p-0 print:bg-transparent">
        {/* Dossier Letterhead */}
        <header className="border-b-2 border-ink pb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-accent" aria-hidden="true" />
              <span className="font-serif text-xl tracking-tight font-medium text-ink">VeraTrace Evidence Dossier</span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-normal text-ink">
              {caseData.title}
            </h1>
            <p className="text-xs font-mono text-muted mt-1">
              Case Reference: {caseData.caseId} • Generated: {formatDate(new Date().toISOString())}
            </p>
          </div>

          <div className="text-right">
            <Badge status={caseData.status} />
          </div>
        </header>

        {/* Executive Summary */}
        <section className="space-y-3" aria-labelledby="summary-heading">
          <h2 id="summary-heading" className="text-xs font-bold uppercase tracking-wider text-muted">
            Case Summary & Context
          </h2>
          <p className="text-sm text-ink leading-relaxed">
            {caseData.summary || 'No narrative summary entered for this case file.'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 text-xs border-t border-border">
            <div>
              <span className="text-muted block">First Recorded</span>
              <span className="font-mono text-ink">{formatDate(caseData.createdAt)}</span>
            </div>
            <div>
              <span className="text-muted block">Last Modified</span>
              <span className="font-mono text-ink">{formatDate(caseData.updatedAt)}</span>
            </div>
            <div>
              <span className="text-muted block">Preserved Files</span>
              <span className="font-mono text-ink font-semibold">{evidence.length}</span>
            </div>
            <div>
              <span className="text-muted block">Timeline Incidents</span>
              <span className="font-mono text-ink font-semibold">{timeline.length}</span>
            </div>
          </div>
        </section>

        {/* Chronological Timeline */}
        <section className="space-y-4 page-break" aria-labelledby="timeline-ledger-heading">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h2 id="timeline-ledger-heading" className="text-xs font-bold uppercase tracking-wider text-muted">
              Chronological Incident Timeline
            </h2>
            <span className="text-xs text-muted font-mono">{timeline.length} events logged</span>
          </div>

          {sortedTimeline.length === 0 ? (
            <p className="text-sm text-muted italic">No timeline occurrences recorded.</p>
          ) : (
            <div className="space-y-4 divide-y divide-border">
              {sortedTimeline.map((item, idx) => {
                const linked = evidence.find((e) => e.evidenceId === item.relatedEvidenceId);
                return (
                  <div key={item.eventId || idx} className="pt-3.5 space-y-1.5 first:pt-0">
                    <div className="flex flex-wrap items-center justify-between text-xs">
                      <span className="font-mono font-medium text-ink">
                        {formatDateTime(item.occurredAt)}
                      </span>
                      {item.timeConfidence === 'uncertain' && (
                        <span className="text-[11px] text-unverified italic">
                          (Approximate / recalled time)
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-ink">{item.label}</p>
                    {linked && (
                      <p className="text-xs text-muted font-mono">
                        Referenced file: {linked.fileName} ({linked.evidenceId})
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Evidence Hash Ledger */}
        <section className="space-y-4 page-break" aria-labelledby="evidence-ledger-heading">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h2 id="evidence-ledger-heading" className="text-xs font-bold uppercase tracking-wider text-muted">
              Evidence Ledger & SHA-256 Fingerprints
            </h2>
            <span className="text-xs text-muted font-mono">{evidence.length} files cataloged</span>
          </div>

          {evidence.length === 0 ? (
            <p className="text-sm text-muted italic">No evidence records cataloged.</p>
          ) : (
            <div className="border border-border rounded overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File & Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>SHA-256 Fingerprint</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evidence.map((item) => (
                    <TableRow key={item.evidenceId}>
                      <TableCell className="font-medium text-xs">
                        <div className="font-mono text-ink">{item.fileName}</div>
                        <div className="text-[10px] text-muted">{item.mimeType}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted">
                        {formatBytes(item.sizeBytes)}
                      </TableCell>
                      <TableCell>
                        <Badge status={item.verificationStatus} />
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-ink break-all max-w-xs">
                        {item.sha256}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        {/* Formal Cryptographic Declaration & Disclaimer */}
        <footer className="pt-6 border-t-2 border-border text-xs text-muted space-y-2">
          <p className="font-medium text-ink">
            Verification statement:
          </p>
          <p className="leading-relaxed">
            The cryptographic fingerprints recorded above were computed using the SHA-256 cryptographic hash standard. Any modification to a recorded file, including compression, re-encoding, or text alterations, produces a radically different hash and invalidates verification.
          </p>
          <p className="text-[11px] text-muted/80 leading-normal">
            Disclaimer: A valid SHA-256 hash confirms only that the byte structure of the file in question is identical to the file initially presented to VeraTrace. It does not establish the identity of the document creator, corroborate the factual accuracy of statements, or constitute legal advice.
          </p>
        </footer>
      </article>
    </div>
  );
}
