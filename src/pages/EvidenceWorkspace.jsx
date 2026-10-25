import { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, UploadCloud, Search, Copy, Check, X, FileText, FolderOpen, Info,
  AlertTriangle, Clock3,
} from 'lucide-react';
import Button from '../components/Button';
import StatusChip from '../components/StatusChip';
import EmptyState from '../components/EmptyState';
import { useCase } from '../hooks/useCase';
import { useEvidenceForCase } from '../hooks/useEvidenceForCase';
import {
  processEvidenceFile,
  recheckEvidenceIntegrity,
  subscribeEvidence,
} from '../services/evidenceService';
import styles from './EvidenceWorkspace.module.css';

const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'MATCH', label: 'Verified' },
  { key: 'UNVERIFIED', label: 'Unverified' },
  { key: 'MISMATCH', label: 'Changed' },
];

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatWhen(iso) {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function HashCell({ hash }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the full hash is still in the title attribute */
    }
  }

  return (
    <span className={styles.hashCell}>
      <code className={styles.hash} title={hash}>{hash.slice(0, 12)}…</code>
      <button type="button" className={styles.copyBtn} onClick={copy}
        aria-label={copied ? 'Hash copied' : 'Copy full hash'}>
        {copied ? <Check strokeWidth={2.4} /> : <Copy strokeWidth={2} />}
      </button>
    </span>
  );
}

/**
 * @param {{ onAddEvidence?: () => void }} props
 * Person 2: pass `onAddEvidence` to open your upload + hashing flow. With no
 * handler the dropzone stays presentational, so you can wire real behaviour
 * from a parent without editing this file.
 */
export default function EvidenceWorkspace({ onAddEvidence }) {
  const { caseId } = useParams();
  const { data: caseRecord } = useCase(caseId);
  const { data: allEvidence } = useEvidenceForCase(caseId);

  const [filter, setFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRechecking, setIsRechecking] = useState(false);
  const [, setRefreshTick] = useState(0);

  // Subscribe to live evidence mutations for this case
  useEffect(() => {
    if (!caseId) return undefined;
    return subscribeEvidence(caseId, () => {
      setRefreshTick((t) => t + 1);
    });
  }, [caseId]);

  async function handleFiles(files) {
    if (!files || files.length === 0 || !caseId) return;
    setUploadError(null);
    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        await processEvidenceFile(caseId, files[i]);
      }
    } catch (err) {
      console.error('Evidence processing error:', err);
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function handleChooseFiles() {
    if (onAddEvidence) {
      onAddEvidence();
    } else {
      fileInputRef.current?.click();
    }
  }

  function onFileInputChange(e) {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  }

  async function handleRecheck(evidenceId) {
    if (!evidenceId) return;
    setIsRechecking(true);
    try {
      await recheckEvidenceIntegrity(evidenceId);
    } catch (err) {
      console.error('Integrity check failed:', err);
    } finally {
      setIsRechecking(false);
    }
  }

  if (!caseRecord) {
    return (
      <EmptyState
        icon={<FolderOpen strokeWidth={1.6} />}
        title="Case not found"
        action={<Button to="/dashboard" iconLeft={<ArrowLeft />}>Back to my cases</Button>}
      />
    );
  }

  const evidence = allEvidence
    .filter((e) => (filter === 'ALL' ? true : e.verificationStatus === filter))
    .filter((e) => e.fileName.toLowerCase().includes(query.trim().toLowerCase()));

  const selected = allEvidence.find((e) => e.evidenceId === selectedId) || null;

  return (
    <div className={styles.wrap}>
      <Link to={`/case/${caseId}`} className={styles.back}>
        <ArrowLeft aria-hidden="true" strokeWidth={2} />
        Back to case
      </Link>

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Evidence</h1>
          <p className={styles.subtitle}>{caseRecord.title}</p>
        </div>
      </header>

      <p className={styles.disclaimer}>
        <Info aria-hidden="true" strokeWidth={2} />
        A matching hash shows a file hasn't changed since it was added here. It doesn't prove who
        created the file or when the incident happened.
      </p>

      {/* Upload failure / validation error alert */}
      {uploadError && (
        <div className={styles.alertBanner} role="alert">
          <AlertTriangle className={styles.alertIcon} aria-hidden="true" strokeWidth={2} />
          <p className={styles.alertText}>{uploadError}</p>
          <button
            type="button"
            className={styles.alertClose}
            onClick={() => setUploadError(null)}
            aria-label="Dismiss error"
          >
            <X strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Hidden file input supporting multi-file selection */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        style={{ display: 'none' }}
        onChange={onFileInputChange}
        accept="image/png,image/jpeg,application/pdf,text/plain"
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Upload surface connected to forensic ingestion pipeline */}
      <div
        className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className={styles.dropIcon} aria-hidden="true">
          {isUploading ? <Clock3 strokeWidth={1.6} className={styles.spin} /> : <UploadCloud strokeWidth={1.6} />}
        </span>
        <div className={styles.dropCopy}>
          <p className={styles.dropTitle}>
            {isUploading ? 'Processing and verifying evidence…' : 'Add evidence to this case'}
          </p>
          <p className={styles.dropHint}>
            {isUploading
              ? 'Calculating SHA-256 digest and extracting metadata on device'
              : 'Screenshots, photos, PDFs or text files. Files stay on your device.'}
          </p>
        </div>
        <Button
          iconLeft={<UploadCloud />}
          className={styles.dropBtn}
          onClick={handleChooseFiles}
          disabled={isUploading}
        >
          {isUploading ? 'Processing…' : 'Choose files'}
        </Button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters} role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`${styles.filter} ${filter === f.key ? styles.filterActive : ''}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className={styles.searchWrap}>
          <Search className={styles.searchIcon} aria-hidden="true" strokeWidth={2} />
          <label className="visually-hidden" htmlFor="evidence-search">Search files</label>
          <input
            id="evidence-search"
            type="search"
            className={styles.search}
            placeholder="Search files…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {evidence.length === 0 ? (
        <EmptyState
          compact
          title={allEvidence.length === 0 ? 'No evidence added yet' : 'Nothing matches those filters'}
          description={
            allEvidence.length === 0
              ? 'Items you add will show up here with their recorded details.'
              : 'Try another status or clear the search.'
          }
          action={allEvidence.length > 0 && (
            <Button variant="ghost" onClick={() => { setFilter('ALL'); setQuery(''); }}>Clear filters</Button>
          )}
        />
      ) : (
        <>
          {/* Desktop: table */}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Recorded</th>
                  <th scope="col">Size</th>
                  <th scope="col">SHA-256</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((item) => (
                  <tr
                    key={item.evidenceId}
                    className={selectedId === item.evidenceId ? styles.rowSelected : ''}
                  >
                    <td>
                      <button type="button" className={styles.fileBtn} onClick={() => setSelectedId(item.evidenceId)}>
                        <FileText className={styles.fileIcon} aria-hidden="true" strokeWidth={2} />
                        <span className={styles.fileName}>{item.fileName}</span>
                      </button>
                    </td>
                    <td className={styles.muted}>{formatWhen(item.recordedAt)}</td>
                    <td className={styles.muted}>{formatBytes(item.sizeBytes)}</td>
                    <td><HashCell hash={item.sha256} /></td>
                    <td><StatusChip status={item.verificationStatus} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards */}
          <ul className={styles.cards}>
            {evidence.map((item) => (
              <li key={item.evidenceId}>
                <button type="button" className={styles.card} onClick={() => setSelectedId(item.evidenceId)}>
                  <span className={styles.cardTop}>
                    <FileText className={styles.fileIcon} aria-hidden="true" strokeWidth={2} />
                    <span className={styles.fileName}>{item.fileName}</span>
                  </span>
                  <span className={styles.cardMeta}>
                    {formatBytes(item.sizeBytes)} · {formatWhen(item.recordedAt)}
                  </span>
                  <span className={styles.cardFoot}>
                    <StatusChip status={item.verificationStatus} size="sm" />
                    <code className={styles.hash}>{item.sha256.slice(0, 12)}…</code>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Detail panel */}
      {selected && (
        <>
          <div className={styles.scrim} onClick={() => setSelectedId(null)} aria-hidden="true" />
          <aside className={styles.drawer} aria-label={`Details for ${selected.fileName}`}>
            <div className={styles.drawerHead}>
              <h2 className={styles.drawerTitle}>File details</h2>
              <button type="button" className={styles.closeBtn} onClick={() => setSelectedId(null)} aria-label="Close details">
                <X strokeWidth={2} />
              </button>
            </div>

            <p className={styles.drawerFile}>{selected.fileName}</p>
            <StatusChip status={selected.verificationStatus} />

            <dl className={styles.drawerList}>
              <div><dt>Type</dt><dd>{selected.mimeType}</dd></div>
              <div><dt>Size</dt><dd>{formatBytes(selected.sizeBytes)}</dd></div>
              <div><dt>Recorded</dt><dd>{formatWhen(selected.recordedAt)}</dd></div>
              <div><dt>Evidence ID</dt><dd><code className={styles.hash}>{selected.evidenceId}</code></dd></div>
              {selected.extractedMetadata?.extractedFileTimeUtc && (
                <div>
                  <dt>Embedded time</dt>
                  <dd>
                    {formatWhen(selected.extractedMetadata.extractedFileTimeUtc)}
                    <span className={styles.subNote}>Device metadata (unverified)</span>
                  </dd>
                </div>
              )}
              {selected.extractedMetadata?.metadata && typeof selected.extractedMetadata.metadata === 'object' && (
                <>
                  {'pageCount' in selected.extractedMetadata.metadata && (
                    <div>
                      <dt>Pages</dt>
                      <dd>{String(selected.extractedMetadata.metadata.pageCount)}</dd>
                    </div>
                  )}
                  {'dimensions' in selected.extractedMetadata.metadata && (
                    <div>
                      <dt>Dimensions</dt>
                      <dd>
                        {`${selected.extractedMetadata.metadata.dimensions?.width} × ${selected.extractedMetadata.metadata.dimensions?.height}`}
                      </dd>
                    </div>
                  )}
                </>
              )}
            </dl>

            <div className={styles.drawerHash}>
              <dt>SHA-256</dt>
              <dd><code className={styles.hashFull}>{selected.sha256}</code></dd>
            </div>

            <p className={styles.drawerNote}>
              "Recorded" is the time VeraTrace saw this file — not a verified incident time.
            </p>

            <Button
              variant="ghost"
              full
              onClick={() => handleRecheck(selected.evidenceId)}
              disabled={isRechecking}
            >
              {isRechecking ? 'Verifying SHA-256…' : 'Re-check this file'}
            </Button>
          </aside>
        </>
      )}
    </div>
  );
}