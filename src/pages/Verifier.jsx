import { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, RotateCcw, TriangleAlert, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from '../components/ui/Button';
import { Select, Label } from '../components/ui/Field';
import { SealMark } from '../components/SealMark';
import { HashComparison } from '../components/HashComparison';
import { HashDisplay } from '../components/HashDisplay';
import { useVera } from '../store/VeraStore';
import { useToast } from '../store/ToastProvider';
import { MAX_FILE_BYTES, sha256File } from '../lib/hash';
import { formatBytes } from '../lib/format';

/** One side of the comparison: a quiet drop target that becomes a digest. */
function FileSlot({ slot, state, onFile, onClear }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const busy = state.status === 'hashing';

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        depth.current -= 1;
        if (depth.current <= 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        const file = event.dataTransfer?.files?.[0];
        if (file) onFile(file);
      }}
      className={cn(
        'flex min-h-56 flex-col rounded-lg border border-dashed px-5 py-6 transition-[border-color,background-color] duration-200',
        dragging ? 'border-violet-deep bg-wash' : 'border-lilac bg-wash/35 hover:border-violet',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow text-[0.625rem]">{slot.label}</p>
        {state.file ? (
          <button
            type="button"
            onClick={onClear}
            className="-mr-2 inline-flex min-h-9 items-center gap-1 rounded-sm px-2 text-xs text-muted transition-colors hover:text-plum"
          >
            <X aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
            Clear
          </button>
        ) : null}
      </div>

      {state.file ? (
        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <p className="break-words text-sm font-medium text-plum">{state.file.name}</p>
          <p className="mono mt-1 text-[0.6875rem] text-muted">{formatBytes(state.file.size)}</p>

          {busy ? (
            <div className="mt-4">
              <div className="h-[3px] w-full overflow-hidden rounded-full bg-lilac/70">
                <div
                  className="h-full rounded-full bg-violet-deep transition-[width] duration-150 ease-linear"
                  style={{ width: `${Math.round(state.progress * 100)}%` }}
                />
              </div>
              <p className="mono mt-2 text-[0.625rem] tracking-[0.1em] text-muted">
                HASHING {Math.round(state.progress * 100)}%
              </p>
            </div>
          ) : null}

          {state.error ? (
            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-alert">
              <TriangleAlert aria-hidden="true" strokeWidth={1.5} className="mt-0.5 size-3.5 shrink-0" />
              {state.error}
            </p>
          ) : null}

          {state.hash ? (
            <div className="mt-4">
              <p className="eyebrow mb-1.5 text-[0.625rem]">SHA-256</p>
              <HashDisplay hash={state.hash} size="sm" label={`${slot.label} hash`} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 flex flex-1 flex-col items-start justify-center">
          <p className="max-w-xs text-sm leading-relaxed text-muted">{slot.hint}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => inputRef.current?.click()}>
            <FileUp aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
            Choose a file
          </Button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        aria-label={`Choose ${slot.label.toLowerCase()}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onFile(file);
        }}
      />
    </div>
  );
}

const SLOTS = {
  original: {
    key: 'original',
    label: 'The original',
    hint: 'The file as you first had it, or any file whose hash you want to use as the reference.',
  },
  candidate: {
    key: 'candidate',
    label: 'The file to check',
    hint: 'The copy you want to compare — one you were sent, downloaded again, or found later.',
  },
};

const EMPTY = { file: null, hash: '', status: 'idle', progress: 0, error: '' };

export function Verifier() {
  const { cases, evidenceByCase } = useVera();
  const toast = useToast();

  const [original, setOriginal] = useState(EMPTY);
  const [candidate, setCandidate] = useState(EMPTY);
  const [referenceId, setReferenceId] = useState('');

  const records = useMemo(
    () =>
      cases.flatMap((item) =>
        (evidenceByCase[item.caseId] || []).map((record) => ({ ...record, caseTitle: item.title })),
      ),
    [cases, evidenceByCase],
  );

  const reference = records.find((record) => record.evidenceId === referenceId) || null;
  const expected = reference ? reference.sha256 : original.hash;
  const expectedLabel = reference ? `Recorded hash · ${reference.fileName}` : 'The original';

  const hashInto = async (setState, file) => {
    if (file.size > MAX_FILE_BYTES) {
      setState({ ...EMPTY, file, error: `This file is ${formatBytes(file.size)}, over the 50 MB limit for this demo.` });
      toast('File is too large', { tone: 'error', detail: 'This demo hashes files up to 50 MB.' });
      return;
    }
    setState({ file, hash: '', status: 'hashing', progress: 0, error: '' });
    try {
      const hash = await sha256File(file, (progress) =>
        setState((prev) => ({ ...prev, progress })),
      );
      setState({ file, hash, status: 'done', progress: 1, error: '' });
    } catch (error) {
      setState({ ...EMPTY, file, error: error.message || 'That file could not be read.' });
      toast('Could not hash that file', { tone: 'error', detail: error.message });
    }
  };

  const ready = Boolean(expected && candidate.hash);
  const matched = ready && expected === candidate.hash;
  const announcedRef = useRef('');

  // One toast per distinct comparison, never one per render.
  useEffect(() => {
    if (!ready) return;
    const key = `${expected}:${candidate.hash}`;
    if (announcedRef.current === key) return;
    announcedRef.current = key;
    toast(matched ? 'Hashes match' : 'Hashes do not match', {
      tone: matched ? 'success' : 'error',
      detail: matched
        ? 'The file has not changed since the original.'
        : 'The two files are not the same bytes.',
    });
  }, [ready, matched, expected, candidate.hash, toast]);

  const reset = () => {
    setOriginal(EMPTY);
    setCandidate(EMPTY);
    setReferenceId('');
    announcedRef.current = '';
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <header className="max-w-2xl">
        <p className="eyebrow">Verify</p>
        <h1 className="display-lg mt-4 text-plum">
          Is this still the <em className="italic">same</em> file?
        </h1>
        <p className="mt-5 text-[0.9375rem] leading-relaxed text-muted">
          Put two files side by side and compare their fingerprints. Both are read on this device only. You can also
          compare one file against a hash already on your record.
        </p>
      </header>

      {records.length ? (
        <div className="mt-10 max-w-md">
          <Label htmlFor="reference-record" hint="Optional">
            Use a recorded hash as the reference
          </Label>
          <Select
            id="reference-record"
            value={referenceId}
            onChange={(event) => setReferenceId(event.target.value)}
          >
            <option value="">Compare two files I choose</option>
            {records.map((record) => (
              <option key={record.evidenceId} value={record.evidenceId}>
                {record.fileName} — {record.caseTitle}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {reference ? (
          <div className="flex min-h-56 flex-col rounded-lg border border-lilac bg-paper px-5 py-6 shadow-sheet">
            <p className="eyebrow text-[0.625rem]">Reference on record</p>
            <p className="mt-4 break-words text-sm font-medium text-plum">{reference.fileName}</p>
            <p className="mono mt-1 text-[0.6875rem] text-muted">
              {reference.evidenceId} · {formatBytes(reference.sizeBytes)}
            </p>
            <div className="mt-4">
              <p className="eyebrow mb-1.5 text-[0.625rem]">SHA-256</p>
              <HashDisplay hash={reference.sha256} size="sm" label="Recorded hash" />
            </div>
            <button
              type="button"
              onClick={() => setReferenceId('')}
              className="mt-auto inline-flex w-fit min-h-9 items-center gap-1 rounded-sm text-xs text-violet-deep underline decoration-lilac underline-offset-4 hover:decoration-violet"
            >
              Use a file instead
            </button>
          </div>
        ) : (
          <FileSlot
            slot={SLOTS.original}
            state={original}
            onFile={(file) => hashInto(setOriginal, file)}
            onClear={() => setOriginal(EMPTY)}
          />
        )}

        <FileSlot
          slot={SLOTS.candidate}
          state={candidate}
          onFile={(file) => hashInto(setCandidate, file)}
          onClear={() => setCandidate(EMPTY)}
        />
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {original.status === 'hashing' || candidate.status === 'hashing'
          ? 'Hashing a file.'
          : ready
            ? matched
              ? 'The hashes match. The file has not changed.'
              : 'The hashes do not match. The files are not identical.'
            : ''}
      </p>

      <div className="mt-10">
        {ready ? (
          <>
            <HashComparison
              expected={expected}
              actual={candidate.hash}
              expectedLabel={expectedLabel}
              actualLabel={`The file to check · ${candidate.file?.name || ''}`}
            />
            <div className="mt-5">
              <Button variant="secondary" onClick={reset}>
                <RotateCcw aria-hidden="true" strokeWidth={1.5} className="size-4" />
                Compare different files
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-lilac bg-paper px-6 py-10 text-center">
            <SealMark size={28} className="mx-auto opacity-60" />
            <h2 className="display-md mt-4 text-plum">Waiting for both sides</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
              {expected
                ? 'Add the file you want to check, and the comparison appears here.'
                : 'Add a reference — a file or a recorded hash — and the file you want to check.'}
            </p>
          </div>
        )}
      </div>

      <hr className="rule mt-14" />

      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted">
        A hash comparison answers one narrow question: are these the same bytes? It cannot tell you who made a
        file, when the events in it happened, or whether a copy that differs was changed deliberately. Re-saving or
        forwarding a file is usually enough to change its hash.
      </p>
    </div>
  );
}
