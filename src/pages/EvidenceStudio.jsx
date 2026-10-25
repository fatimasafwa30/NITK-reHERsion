import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, ArrowRight, ChevronRight, FileDown, FileSearch, Files, Search, SlidersHorizontal, Trash, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Field';
import { EmptyState } from '../components/ui/EmptyState';
import { Dialog } from '../components/ui/Dialog';
import { Tooltip } from '../components/ui/Tooltip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Dropzone } from '../components/Dropzone';
import { EvidenceSheet } from '../components/EvidenceSheet';
import { CopyButton, HashDisplay } from '../components/HashDisplay';
import { HashComparison } from '../components/HashComparison';
import { VerificationMark } from '../components/ui/StatusMark';
import { useVera } from '../store/VeraStore';
import { useToast } from '../store/ToastProvider';
import { useMediaQuery } from '../lib/useMediaQuery';
import { sha256File } from '../lib/hash';
import { fileKind, formatBytes, formatDateTime } from '../lib/format';
import { isDemoCase } from '../data/demoCaseData';

function Detail({ record, caseId, onClose, onRemove }) {
  const { setVerificationStatus } = useVera();
  const toast = useToast();
  const inputRef = useRef(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);

  const reverify = async (file) => {
    setChecking(true);
    setResult(null);
    try {
      const sha256 = await sha256File(file);
      const match = sha256 === record.sha256;
      setResult({ sha256, fileName: file.name });
      setVerificationStatus(caseId, record.evidenceId, match ? 'MATCH' : 'MISMATCH');
      toast(match ? 'File is unchanged' : 'Hashes do not match', {
        tone: match ? 'success' : 'error',
        detail: match
          ? `${file.name} is byte-for-byte identical to the record.`
          : `${file.name} is not the same bytes as the record.`,
      });
    } catch (error) {
      setVerificationStatus(caseId, record.evidenceId, 'ERROR');
      toast('Could not check that file', { tone: 'error', detail: error.message });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="mono text-[0.625rem] font-medium tracking-[0.14em] text-muted">
            {fileKind(record.mimeType)}
          </p>
          <h2 className="mt-1 text-base font-medium text-plum" title={record.fileName}>
            {record.fileName}
          </h2>
          <p className="mono mt-1 text-xs text-muted">{record.evidenceId}</p>
        </div>
        <VerificationMark status={record.verificationStatus} />
      </div>

      {record.previewUrl && record.mimeType?.startsWith('image/') && (
        <div className="mt-4 overflow-hidden rounded-md border border-lilac bg-wash/30 p-1.5 shadow-sm">
          <div className="mb-1 flex items-center justify-between px-1 text-[0.625rem] text-muted">
            <span className="mono font-semibold text-violet-deep">PREVIEW ARTIFACT</span>
            <span className="mono">{record.platform || 'Sealed Capture'}</span>
          </div>
          <img
            src={record.previewUrl}
            alt={record.fileName}
            className="max-h-64 w-full rounded object-contain bg-paper"
          />
        </div>
      )}

      {record.notes && (
        <div className="mt-4 rounded-md border border-lilac/70 bg-wash/40 p-3 text-xs text-muted">
          <p className="mono text-[0.625rem] font-semibold uppercase tracking-wider text-violet-deep mb-1">
            Investigative Notes & Context
          </p>
          <p className="leading-relaxed text-plum/90">{record.notes}</p>
          {record.userClaimedSource && (
            <p className="mono mt-2 text-[0.6875rem] text-muted truncate">Source: {record.userClaimedSource}</p>
          )}
        </div>
      )}

      <hr className="rule my-5" />

      <dl className="mono space-y-3 text-[0.6875rem]">
        <div>
          <dt className="text-muted">Recorded</dt>
          <dd className="mt-0.5 text-plum">{formatDateTime(record.recordedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted">Size</dt>
          <dd className="mt-0.5 text-plum">{formatBytes(record.sizeBytes)}</dd>
        </div>
        <div>
          <dt className="text-muted">MIME type</dt>
          <dd className="mt-0.5 text-plum">{record.mimeType}</dd>
        </div>
      </dl>

      <hr className="rule my-5" />

      <div>
        <div className="flex items-center justify-between">
          <p className="eyebrow">Recorded hash</p>
          <CopyButton value={record.sha256} label="Copy SHA-256" />
        </div>
        <HashDisplay sha256={record.sha256} className="mt-2" />
      </div>

      <div className="mt-6 rounded-md border border-lilac bg-wash/50 p-4">
        <p className="text-xs font-medium text-plum">Re-verify this file</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Pick the file from your computer again to recompute its hash and verify it has not changed.
        </p>

        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) reverify(file);
            event.target.value = '';
          }}
        />

        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={checking}
            onClick={() => inputRef.current?.click()}
          >
            {checking ? 'Hashing…' : 'Check a file'}
          </Button>
          {record.verificationStatus !== 'UNVERIFIED' && (
            <button
              type="button"
              onClick={() => setVerificationStatus(caseId, record.evidenceId, 'UNVERIFIED')}
              className="text-xs text-muted hover:text-plum"
            >
              Reset to unverified
            </button>
          )}
        </div>

        {result && (
          <HashComparison
            className="mt-4"
            expected={record.sha256}
            actual={result.sha256}
            actualFileName={result.fileName}
          />
        )}
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-lilac pt-4">
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-alert"
        >
          <Trash aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
          Remove from case
        </button>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

export function EvidenceStudio() {
  const { caseId } = useParams();
  const { getCase, getEvidence, addEvidence, removeEvidence } = useVera();
  const toast = useToast();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const record = getCase(caseId);
  const evidence = getEvidence(caseId);

  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedId, setSelectedId] = useState(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [sealedId, setSealedId] = useState(null);

  const selected = useMemo(
    () => evidence.find((item) => item.evidenceId === selectedId) || null,
    [evidence, selectedId],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return evidence
      .filter((item) => {
        if (kindFilter === 'ALL') return true;
        return fileKind(item.mimeType) === kindFilter;
      })
      .filter((item) => {
        if (statusFilter === 'ALL') return true;
        return item.verificationStatus === statusFilter;
      })
      .filter((item) =>
        needle
          ? `${item.fileName} ${item.evidenceId}`.toLowerCase().includes(needle)
          : true,
      )
      .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));
  }, [evidence, kindFilter, query, statusFilter]);

  const kinds = useMemo(() => {
    const set = new Set(evidence.map((item) => fileKind(item.mimeType)));
    return Array.from(set);
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

  const onSealed = async (evidenceRecord, file) => {
    await addEvidence(caseId, evidenceRecord, file);
    setSealedId(evidenceRecord.evidenceId);
    toast('File sealed', { detail: `${evidenceRecord.fileName} is now on the record.` });
  };

  const handleRemove = (evidenceId) => {
    const item = evidence.find((e) => e.evidenceId === evidenceId);
    removeEvidence(caseId, evidenceId);
    if (selectedId === evidenceId) setSelectedId(null);
    setConfirmRemoveId(null);
    toast('File removed from case', {
      detail: item ? item.fileName : undefined,
    });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <nav aria-label="Breadcrumb" className="mb-8">
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
            Evidence
          </li>
        </ol>
      </nav>

      {isDemoCase(caseId) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <span className="mono font-bold uppercase tracking-wider text-amber-800">Simulated Demo Case</span>
            <span className="text-amber-700/80">·</span>
            <span>All evidence records, files, and hashes are fictional demonstration artifacts.</span>
          </div>
        </div>
      )}

      {/* Workflow Navigation Banner */}
      <div className="mt-6 mb-8 flex flex-wrap items-center gap-2 rounded-lg border border-lilac/70 bg-wash/50 px-4 py-3 text-xs text-plum">
        <span className="mono font-semibold uppercase tracking-wider text-muted mr-1">Journey:</span>
        <Link to={`/case/${caseId}`} className="rounded px-2 py-0.5 text-muted hover:text-plum hover:bg-paper">
          1. Case Overview
        </Link>
        <ArrowRight className="size-3 text-lilac shrink-0" aria-hidden="true" />
        <span className="rounded border border-violet-deep/30 bg-paper px-2 py-0.5 font-semibold text-violet-deep shadow-xs">
          2. Add Evidence (Active)
        </span>
        <ArrowRight className="size-3 text-lilac shrink-0" aria-hidden="true" />
        <Link to={`/case/${caseId}/analysis`} className="rounded px-2 py-0.5 text-muted hover:text-plum hover:bg-paper">
          3. Analyse Patterns
        </Link>
        <ArrowRight className="size-3 text-lilac shrink-0" aria-hidden="true" />
        <Link to={`/case/${caseId}/dossier`} className="rounded px-2 py-0.5 text-muted hover:text-plum hover:bg-paper font-medium">
          4. Export Dossier
        </Link>
      </div>

      <header className="max-w-2xl">
        <p className="eyebrow">Evidence</p>
        <h1 className="display-lg mt-4 text-plum">
          Seal files to compute and preserve their cryptographic hash.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Drag in screenshots, chat exports, recordings, or PDFs. Every file is hashed with SHA-256 before being
          saved to private browser storage. Files never leave your device.
        </p>
      </header>

      <section aria-label="Drop files to seal" className="mt-10">
        <Dropzone onSealed={onSealed} />
      </section>

      <section aria-label="Sealed files" className="mt-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="display-md text-plum">Sealed in this case</h2>
            <p className="mono mt-1 text-xs text-muted">
              {evidence.length} {evidence.length === 1 ? 'record' : 'records'} in {record.caseId}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button to={`/case/${caseId}/analysis`} variant="secondary">
              <Activity className="size-4" aria-hidden="true" />
              Cross-Platform Analysis
            </Button>
            <Button to={`/case/${caseId}/dossier`} variant="primary">
              <FileDown className="size-4" aria-hidden="true" />
              Generate Evidence Dossier
            </Button>
          </div>
        </div>

        {evidence.length ? (
          <>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by file name or ID…"
                  className="pl-9"
                />
              </div>

              <div className="flex items-center gap-2">
                <SlidersHorizontal aria-hidden="true" className="size-4 text-muted sm:hidden" />
                <Select
                  value={kindFilter}
                  onChange={(event) => setKindFilter(event.target.value)}
                  aria-label="Filter by file type"
                  className="w-full sm:w-40"
                >
                  <option value="ALL">All file types</option>
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </Select>

                <Select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  aria-label="Filter by verification status"
                  className="w-full sm:w-44"
                >
                  <option value="ALL">All statuses</option>
                  <option value="MATCH">Matching</option>
                  <option value="MISMATCH">Changed</option>
                  <option value="UNVERIFIED">Unverified</option>
                </Select>
              </div>
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-12">
              <div className={selected && isDesktop ? 'lg:col-span-7' : 'lg:col-span-12'}>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
                  {filtered.map((item) => (
                    <li key={item.evidenceId}>
                      <EvidenceSheet
                        record={item}
                        drawSeal={item.evidenceId === sealedId}
                        isSelected={item.evidenceId === selectedId}
                        onClick={() => setSelectedId(item.evidenceId)}
                      />
                    </li>
                  ))}
                </ul>
                {!filtered.length && (
                  <p className="mono py-12 text-center text-xs text-muted">
                    No files match that search and filter.
                  </p>
                )}
              </div>

              {isDesktop && selected && (
                <aside className="lg:col-span-5">
                  <div className="sticky top-24 rounded-lg border border-lilac bg-paper p-6 shadow-sheet">
                    <Detail
                      record={selected}
                      caseId={caseId}
                      onClose={() => setSelectedId(null)}
                      onRemove={() => setConfirmRemoveId(selected.evidenceId)}
                    />
                  </div>
                </aside>
              )}
            </div>
          </>
        ) : (
          <EmptyState
            className="mt-8"
            align="left"
            icon={Files}
            title="No files sealed yet"
          >
            <p>
              Drop a file above to compute its SHA-256 hash and add it to the case.
            </p>
          </EmptyState>
        )}
      </section>

      {/* Mobile detail sheet inside a dialog. */}
      {!isDesktop && (
        <Dialog
          open={Boolean(selected)}
          onOpenChange={(open) => !open && setSelectedId(null)}
          title="Evidence detail"
          description={selected ? selected.fileName : ''}
        >
          {selected && (
            <Detail
              record={selected}
              caseId={caseId}
              onClose={() => setSelectedId(null)}
              onRemove={() => setConfirmRemoveId(selected.evidenceId)}
            />
          )}
        </Dialog>
      )}

      <ConfirmDialog
        open={Boolean(confirmRemoveId)}
        onOpenChange={(open) => !open && setConfirmRemoveId(null)}
        title="Remove this file from the case?"
        description="The record and its SHA-256 hash will be deleted from browser storage. The original file on your computer is not touched."
        confirmLabel="Remove file"
        destructive
        onConfirm={() => confirmRemoveId && handleRemove(confirmRemoveId)}
      />
    </div>
  );
}

export default EvidenceStudio;
