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
        <div className="min-w-0">
          <p className="mono text-[0.625rem] tracking-[0.14em] text-muted">
            {fileKind(record.mimeType, record.fileName)}
          </p>
          <h2 className="display-md mt-1.5 break-words text-plum">{record.fileName}</h2>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-wash hover:text-plum"
            aria-label="Close details"
          >
            <X aria-hidden="true" strokeWidth={1.5} className="size-[18px]" />
          </button>
        ) : null}
      </div>

      <div className="mt-5">
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
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">Evidence ID</dt>
          <dd className="text-plum">{record.evidenceId}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">Type</dt>
          <dd className="text-plum">{record.mimeType}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">Size</dt>
          <dd className="text-plum">{formatBytes(record.sizeBytes)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="shrink-0 text-muted">Recorded</dt>
          <dd className="text-right text-plum">{formatDateTime(record.recordedAt)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        &ldquo;Recorded&rdquo; is the time VeraTrace added the file. It is not a verified time for the events inside
        it.
      </p>

      <hr className="rule my-5" />

      <div className="flex items-end justify-between gap-3">
        <p className="eyebrow text-[0.625rem]">SHA-256</p>
        <CopyButton value={record.sha256} what="SHA-256 hash" />
      </div>
      <div className="mt-2 rounded-md border border-lilac bg-wash/45 px-3 py-3">
        <HashDisplay hash={record.sha256} />
      </div>

      {result ? (
        <div className="mt-5">
          <HashComparison
            expected={record.sha256}
            actual={result.sha256}
            actualLabel="The file you chose"
            fileName={result.fileName}
          />
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={checking}>
          <FileSearch aria-hidden="true" strokeWidth={1.5} className="size-4" />
          {checking ? 'Checking…' : result ? 'Check again' : 'Re-verify this file'}
        </Button>
        <Button variant="danger" onClick={() => onRemove(record)}>
          <Trash aria-hidden="true" strokeWidth={1.5} className="size-4" />
          Remove
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          aria-label={`Choose a copy of ${record.fileName} to re-verify`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) reverify(file);
          }}
        />
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {checking ? 'Checking the file against the recorded hash.' : ''}
      </p>
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

  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [sealedId, setSealedId] = useState(null);

  const selected = evidence.find((item) => item.evidenceId === selectedId) || null;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return evidence
      .filter((item) => (status === 'ALL' ? true : item.verificationStatus === status))
      .filter((item) =>
        needle ? `${item.fileName} ${item.evidenceId} ${item.sha256}`.toLowerCase().includes(needle) : true,
      );
  }, [evidence, query, status]);

  const filtering = Boolean(query.trim()) || status !== 'ALL';

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
          Add a file, and it is <em className="italic">sealed</em> in place.
        </h1>
        <p className="mt-5 text-[0.9375rem] leading-relaxed text-muted">
          Hashing happens in this browser, over the real bytes of the file. The original is never modified and
          nothing is sent anywhere.
        </p>
      </header>

      {/* The dropzone is the focal point of this page, not a strip at the edge. */}
      <Dropzone className="mt-10" onSealed={onSealed} />

      <div className="mt-16">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="display-md text-plum">Sealed files</h2>
            <p className="mono mt-2 text-[0.6875rem] text-muted">
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
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                aria-hidden="true"
                strokeWidth={1.5}
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by file name, ID or hash"
                aria-label="Search sealed files"
                className="pl-9"
              />
            </div>
            <div className="relative sm:w-56">
              <SlidersHorizontal
                aria-hidden="true"
                strokeWidth={1.5}
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              />
              <Select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                aria-label="Filter sealed files by verification state"
                className="pl-9"
              >
                <option value="ALL">All states</option>
                <option value="UNVERIFIED">Not re-verified</option>
                <option value="MATCH">Unchanged</option>
                <option value="MISMATCH">Changed</option>
                <option value="ERROR">Check failed</option>
              </Select>
            </div>
          </div>
        ) : null}

        <p role="status" aria-live="polite" className="sr-only">
          {filtering ? `${filtered.length} of ${evidence.length} files shown.` : ''}
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            {filtered.length ? (
              <ul className="space-y-4">
                {filtered.map((item) => (
                  <li key={item.evidenceId}>
                    <EvidenceSheet
                      record={item}
                      selected={selectedId === item.evidenceId}
                      drawSeal={sealedId === item.evidenceId}
                      onSelect={() => setSelectedId(item.evidenceId)}
                      actions={
                        <>
                          <CopyButton value={item.sha256} what="SHA-256 hash" />
                          <Tooltip label="Remove this record">
                            <button
                              type="button"
                              onClick={() => setPendingRemoval(item)}
                              className="grid size-11 place-items-center rounded-sm text-muted transition-colors hover:bg-alert-wash hover:text-alert sm:size-9"
                              aria-label={`Remove ${item.fileName}`}
                            >
                              <Trash aria-hidden="true" strokeWidth={1.5} className="size-4" />
                            </button>
                          </Tooltip>
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : evidence.length ? (
              <EmptyState
                align="left"
                icon={Files}
                title="No files match that"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setQuery('');
                      setStatus('ALL');
                    }}
                  >
                    Clear search and filter
                  </Button>
                }
              >
                <p>
                  Nothing in this case matches <span className="text-plum">{query.trim() || 'that filter'}</span>.
                </p>
              </EmptyState>
            ) : (
              <EmptyState align="left" icon={Files} title="Nothing sealed yet">
                <p>
                  Drop a file above, or choose one from your device. A screenshot or a short recording is a fine
                  place to start.
                </p>
              </EmptyState>
            )}
          </div>

          {/* Detail pane on a wide screen; the same content in a dialog on a phone. */}
          <aside className="hidden lg:col-span-5 lg:block">
            <div className="sticky top-24 rounded-lg border border-lilac bg-paper p-6 shadow-sheet">
              {selected ? (
                <Detail
                  record={selected}
                  caseId={caseId}
                  onClose={() => setSelectedId(null)}
                  onRemove={setPendingRemoval}
                />
              ) : (
                <div className="py-6 text-center">
                  <Files aria-hidden="true" strokeWidth={1.25} className="mx-auto size-6 text-violet" />
                  <h2 className="display-md mt-4 text-plum">Select a file</h2>
                  <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">
                    Choose a sealed record to see its full hash, re-verify it against a copy on your device, or
                    remove it.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {!isDesktop && selected ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setSelectedId(null);
          }}
          title="Evidence record"
          size="lg"
        >
          <Detail record={selected} caseId={caseId} onRemove={setPendingRemoval} />
        </Dialog>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingRemoval)}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
        title="Remove this record?"
        description="The record and its hash are removed from this case. Your original file on your device is untouched."
        confirmLabel="Remove record"
        onConfirm={() => {
          const target = pendingRemoval;
          if (!target) return;
          removeEvidence(caseId, target.evidenceId);
          if (selectedId === target.evidenceId) setSelectedId(null);
          toast('Record removed', { detail: `${target.fileName} is no longer in this case.` });
          setPendingRemoval(null);
        }}
      >
        {pendingRemoval ? (
          <p className="mono text-xs leading-relaxed text-muted">
            <span className="text-plum">{pendingRemoval.fileName}</span>
            <br />
            {pendingRemoval.evidenceId}
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

export default EvidenceStudio;
