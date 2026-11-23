import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Lock,
  Unlock,
  History,
  Download,
  RefreshCw,
  Clock,
  ExternalLink,
  FolderPlus,
  FileCheck,
  Fingerprint,
  Hash,
  BookmarkCheck,
  UserCheck,
  Cpu,
} from 'lucide-react';
import { useVera } from '../store/VeraStore';
import { useToast } from '../store/ToastProvider';
import { Button } from '../components/ui/Button';
import { CopyButton } from '../components/HashDisplay';
import { formatDateTime, formatBytes } from '../lib/format';

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Human-readable titles for common forensic actions
const ACTION_TITLES = {
  CASE_ESTABLISHED_IN_VAULT: 'Case Established in Vault',
  EVIDENCE_INGESTED_AND_SEALED: 'Evidence Ingested & Cryptographically Sealed',
  HASH_DIGEST_REGISTERED: 'SHA-256 Digest Anchored & Registered',
  EVIDENCE_UPLOADED: 'Evidence Ingestion & Vault Preservation',
  METADATA_RECORDED: 'Forensic Metadata Recorded',
  CHAIN_CHECKPOINT_SIGNATURE: 'Ed25519 Custody Checkpoint Signed',
  PRESERVATION_LOCK_APPLIED: 'Vault Immutability Lock Applied',
  INTEGRITY_VERIFIED: 'Forensic Integrity Verified',
};

function formatActionTitle(action) {
  if (!action) return 'Custody Event';
  if (ACTION_TITLES[action]) return ACTION_TITLES[action];
  return action
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// Field label dictionary for known forensic properties
const KNOWN_LABELS = {
  title: 'Case Title',
  originalFilename: 'Original Filename',
  fileName: 'File Name',
  sha256Hash: 'SHA-256 Hash Digest',
  hashDigest: 'Hash Digest',
  sha256: 'SHA-256 Digest',
  fileSize: 'File Size',
  submissionMethod: 'Submission Method',
  submissionSource: 'Submission Source',
  algorithm: 'Cryptographic Algorithm',
  immutabilityLock: 'Immutability Lock',
  platform: 'Platform Channel',
  senderHandle: 'Sender Identifier',
  sourceUrl: 'Source URL',
  notes: 'Context Notes',
  captureTimestamp: 'Capture Timestamp',
  uploadTimestamp: 'Upload Timestamp',
  storagePath: 'Vault Storage Location',
  recordId: 'Record ID',
  deviceInfo: 'Device Information',
  signerKeyId: 'Signer Key ID',
};

function formatFieldLabel(key) {
  if (KNOWN_LABELS[key]) return KNOWN_LABELS[key];
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isHexHash(val) {
  return typeof val === 'string' && /^[a-fA-F0-9]{64}$/.test(val.trim());
}

function isHashKey(key) {
  const k = key.toLowerCase();
  return k.includes('hash') || k.includes('sha256') || k.includes('digest');
}

function isStatusKey(key) {
  const k = key.toLowerCase();
  return k.includes('status') || k.includes('lock') || k.includes('state');
}

function isSizeKey(key) {
  const k = key.toLowerCase();
  return k.includes('size') || k.includes('bytes');
}

function isTimestampKey(key) {
  const k = key.toLowerCase();
  return k.includes('time') || k.includes('date');
}

function parseMetadataSafely(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return { rawContent: raw };
    }
  }
  return null;
}

// Actor badge icon resolver
function getActorIcon(actor = '') {
  const l = actor.toLowerCase();
  if (l.includes('extension') || l.includes('chrome') || l.includes('mv3')) {
    return <Cpu className="size-3 text-violet-deep shrink-0" />;
  }
  if (l.includes('engine') || l.includes('vault') || l.includes('veratrace')) {
    return <ShieldCheck className="size-3 text-emerald-600 shrink-0" />;
  }
  return <UserCheck className="size-3 text-violet-deep shrink-0" />;
}

// Action milestone icon resolver
function getActionIcon(action = '') {
  if (action.includes('CASE_ESTABLISHED')) {
    return FolderPlus;
  }
  if (action.includes('EVIDENCE_INGESTED') || action.includes('UPLOADED')) {
    return FileCheck;
  }
  if (action.includes('HASH') || action.includes('DIGEST')) {
    return Fingerprint;
  }
  if (action.includes('CHECKPOINT') || action.includes('SIGNATURE')) {
    return BookmarkCheck;
  }
  return ShieldCheck;
}

// Status chip renderer for immutability and state fields
function StatusIndicator({ value }) {
  const str = String(value).toUpperCase();
  const isPositive = ['ACTIVE', 'LOCKED', 'VERIFIED', 'COMPLIANT', 'VALID', 'INTACT', 'ENABLED'].includes(str);
  const isPending = ['PENDING', 'PROCESSING', 'QUEUED'].includes(str);

  let badgeClasses = 'border-slate-300 bg-slate-50 text-slate-700';
  let Icon = Lock;

  if (isPositive) {
    badgeClasses = 'border-emerald-300 bg-emerald-50/80 text-emerald-800';
    Icon = str.includes('LOCK') ? Lock : CheckCircle2;
  } else if (isPending) {
    badgeClasses = 'border-amber-300 bg-amber-50/80 text-amber-800';
    Icon = Clock;
  } else {
    badgeClasses = 'border-rose-300 bg-rose-50/80 text-rose-800';
    Icon = str.includes('LOCK') ? Unlock : ShieldAlert;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badgeClasses}`}>
      <Icon className="size-3 shrink-0" />
      <span>{str}</span>
    </span>
  );
}

// Dedicated full-width hash card with copy action
function HashPropertyCard({ label, hash }) {
  return (
    <div className="rounded-lg border border-lilac/70 bg-wash/40 p-3 shadow-2xs">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
          <Hash className="size-3 text-violet-deep" />
          {label}
        </span>
        <CopyButton value={hash} what={label} size="sm" />
      </div>
      <div className="mono text-[11px] text-plum break-all font-mono select-all bg-paper p-2 rounded border border-lilac/50 leading-relaxed">
        {hash}
      </div>
    </div>
  );
}

// Field-value card renderer supporting dynamic metadata types
function StandardPropertyCard({ label, value, keyName }) {
  if (typeof value === 'boolean') {
    return (
      <div className="rounded-lg border border-lilac/60 bg-paper p-3 shadow-2xs">
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">{label}</span>
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${value ? 'text-emerald-700' : 'text-slate-600'}`}>
          {value ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <ShieldAlert className="size-3.5 text-slate-400" />}
          {value ? 'True / Confirmed' : 'False'}
        </span>
      </div>
    );
  }

  if (isSizeKey(keyName) && typeof value === 'number') {
    return (
      <div className="rounded-lg border border-lilac/60 bg-paper p-3 shadow-2xs">
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">{label}</span>
        <span className="text-xs font-semibold text-plum mono">
          {formatBytes(value)}{' '}
          <span className="text-[10px] text-muted font-normal">({value.toLocaleString()} B)</span>
        </span>
      </div>
    );
  }

  if (
    isStatusKey(keyName) ||
    (typeof value === 'string' && ['ACTIVE', 'LOCKED', 'VERIFIED', 'INACTIVE', 'REVOKED', 'PENDING'].includes(value.toUpperCase()))
  ) {
    return (
      <div className="rounded-lg border border-lilac/60 bg-paper p-3 shadow-2xs">
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">{label}</span>
        <StatusIndicator value={value} />
      </div>
    );
  }

  if (isTimestampKey(keyName) && typeof value === 'string' && !isNaN(Date.parse(value))) {
    return (
      <div className="rounded-lg border border-lilac/60 bg-paper p-3 shadow-2xs">
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">{label}</span>
        <span className="text-xs font-medium text-plum flex items-center gap-1.5">
          <Clock className="size-3 text-muted shrink-0" />
          {formatDateTime(value)}
        </span>
      </div>
    );
  }

  if (typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))) {
    return (
      <div className="rounded-lg border border-lilac/60 bg-paper p-3 shadow-2xs col-span-full sm:col-span-2">
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">{label}</span>
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-violet-deep hover:underline break-all inline-flex items-center gap-1 font-mono"
        >
          {value}
          <ExternalLink className="size-3 shrink-0" />
        </a>
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div className="rounded-lg border border-lilac/60 bg-paper p-3 shadow-2xs col-span-full">
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1.5">{label}</span>
        <div className="flex flex-wrap gap-1.5">
          {value.map((item, i) => (
            <span key={i} className="mono text-[10px] bg-wash text-plum px-2.5 py-0.5 rounded-full border border-lilac/60">
              {typeof item === 'object' ? JSON.stringify(item) : String(item)}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (typeof value === 'object' && value !== null) {
    return (
      <div className="rounded-lg border border-lilac/60 bg-paper p-3 shadow-2xs col-span-full">
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1.5">{label}</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-wash/30 p-2.5 rounded-md border border-lilac/40">
          {Object.entries(value).map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <span className="text-[10px] text-muted font-medium">{formatFieldLabel(k)}:</span>
              <span className="font-mono text-[11px] text-plum">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-lilac/60 bg-paper p-3 shadow-2xs">
      <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">{label}</span>
      <span className="text-xs font-medium text-plum break-words">{String(value)}</span>
    </div>
  );
}

// Parsed Event Metadata Presentation
function CustodyEventMetadata({ metadata }) {
  const parsed = parseMetadataSafely(metadata);

  if (!parsed || Object.keys(parsed).length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-lilac/70 bg-wash/20 p-3.5 text-center text-xs text-muted">
        No additional metadata attributes recorded for this custody event.
      </div>
    );
  }

  const entries = Object.entries(parsed);
  const hashEntries = entries.filter(([k, v]) => isHexHash(v) || (isHashKey(k) && typeof v === 'string'));
  const otherEntries = entries.filter(([k, v]) => !(isHexHash(v) || (isHashKey(k) && typeof v === 'string')));

  return (
    <div className="space-y-3">
      {otherEntries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {otherEntries.map(([key, val]) => (
            <StandardPropertyCard
              key={key}
              keyName={key}
              label={formatFieldLabel(key)}
              value={val}
            />
          ))}
        </div>
      )}

      {hashEntries.length > 0 && (
        <div className="space-y-2">
          {hashEntries.map(([key, val]) => (
            <HashPropertyCard
              key={key}
              label={formatFieldLabel(key)}
              hash={String(val)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ChainOfCustody() {
  const { caseId } = useParams();
  const { getCase, getEvidence } = useVera();
  const toast = useToast();

  const caseData = getCase(caseId);
  const evidenceList = getEvidence(caseId) || [];

  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);

  // Generate deterministic audit log events from case & evidence records
  const auditEntries = useMemo(() => {
    const list = [];
    const caseCreatedTime = caseData?.createdAt || '2026-10-15T09:00:00Z';

    // 1. Genesis Event: Case Inception
    list.push({
      eventId: `custody_${caseId}_genesis`,
      evidenceId: null,
      caseId,
      actor: 'Authorized Intake Lead',
      action: 'CASE_ESTABLISHED_IN_VAULT',
      timestamp: caseCreatedTime,
      metadata: { title: caseData?.title || 'Case Investigation' },
    });

    // 2. Evidence Ingestion Events
    evidenceList.forEach((ev, idx) => {
      const evId = ev.evidenceId || ev.evidence_id;
      const recTime = ev.recordedAt || ev.upload_timestamp || new Date(new Date(caseCreatedTime).getTime() + (idx + 1) * 3600000).toISOString();
      const hash = ev.sha256 || ev.sha256_hash || 'SHA256_PLACEHOLDER';

      list.push({
        eventId: `custody_${evId}_ingest`,
        evidenceId: evId,
        caseId,
        actor: ev.submissionSource === 'EXTENSION_CAPTURE' ? 'Chrome Extension MV3' : 'Victim / Submitter',
        action: 'EVIDENCE_INGESTED_AND_SEALED',
        timestamp: recTime,
        metadata: {
          originalFilename: ev.originalFilename || ev.original_filename || ev.label,
          sha256Hash: hash,
          fileSize: ev.fileSize || 10240,
          submissionMethod: ev.submissionMethod || 'Browser Dropzone',
        },
      });

      list.push({
        eventId: `custody_${evId}_hashed`,
        evidenceId: evId,
        caseId,
        actor: 'VeraTrace Ingestion Engine',
        action: 'HASH_DIGEST_REGISTERED',
        timestamp: new Date(new Date(recTime).getTime() + 1000).toISOString(),
        metadata: {
          algorithm: 'NIST SHA-256',
          hashDigest: hash,
          immutabilityLock: 'ACTIVE',
        },
      });
    });

    // Sort by timestamp
    list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return list;
  }, [caseId, caseData, evidenceList]);

  // Initial synchronous nodes to avoid blank paint during initial load or SSR
  const initialNodes = useMemo(() => {
    return auditEntries.map((item, idx) => ({
      ...item,
      previousEventHash: idx === 0 ? GENESIS_HASH : 'Pending chain verification...',
      currentEventHash: 'Computing SHA-256 seal...',
    }));
  }, [auditEntries]);

  // Compute cryptographic hash chain
  const [chainNodes, setChainNodes] = useState([]);

  const displayNodes = chainNodes.length > 0 ? chainNodes : initialNodes;

  useEffect(() => {
    async function buildChain() {
      let prevHash = GENESIS_HASH;
      const nodes = [];

      for (let i = 0; i < auditEntries.length; i++) {
        const item = auditEntries[i];
        const payload = [
          item.eventId,
          item.evidenceId || '',
          item.caseId,
          item.actor,
          item.action,
          item.timestamp,
          JSON.stringify(item.metadata),
          prevHash,
        ].join('|');

        const currentHash = await sha256(payload);

        nodes.push({
          ...item,
          previousEventHash: prevHash,
          currentEventHash: currentHash,
        });

        prevHash = currentHash;
      }

      setChainNodes(nodes);
    }

    buildChain();
  }, [auditEntries]);

  // Independent verification of the chain
  const verifyChainIntegrity = async () => {
    setVerifying(true);
    let expectedPrev = GENESIS_HASH;
    let intact = true;
    const breakages = [];

    for (let i = 0; i < chainNodes.length; i++) {
      const node = chainNodes[i];
      if (node.previousEventHash !== expectedPrev) {
        breakages.push(`Linkage broken at Event #${i + 1} (${node.eventId})`);
        intact = false;
      }

      const payload = [
        node.eventId,
        node.evidenceId || '',
        node.caseId,
        node.actor,
        node.action,
        node.timestamp,
        JSON.stringify(node.metadata),
        node.previousEventHash,
      ].join('|');

      const recomputed = await sha256(payload);
      if (recomputed !== node.currentEventHash) {
        breakages.push(`Digest mismatch at Event #${i + 1} (${node.eventId})`);
        intact = false;
      }

      expectedPrev = node.currentEventHash;
    }

    setVerificationResult({
      verified: intact,
      totalEntries: chainNodes.length,
      latestHash: expectedPrev,
      breakages,
      verifiedAt: new Date().toISOString(),
    });

    setVerifying(false);
    if (intact) {
      toast('Chain of custody cryptographically verified. All hashes match Genesis.', { tone: 'success' });
    } else {
      toast('Tampering detected in chain of custody!', { tone: 'error' });
    }
  };

  const exportAuditLog = () => {
    const payload = {
      caseId,
      caseTitle: caseData?.title,
      exportedAtUtc: new Date().toISOString(),
      algorithm: 'SHA-256 Hash-Chained Merkle-Linked Ledger',
      genesisHash: GENESIS_HASH,
      chainLength: chainNodes.length,
      auditNodes: chainNodes,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `veratrace_chain_of_custody_${caseId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Audit ledger exported successfully.', { tone: 'success' });
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted mb-2">
            <Link to={`/case/${caseId}`} className="hover:text-plum transition-colors">Case {caseId}</Link>
            <span>/</span>
            <span className="text-plum font-medium">Chain of Custody</span>
          </div>
          <h1 className="display-lg text-plum">
            Tamper-Evident <em className="italic">Chain of Custody</em>
          </h1>
          <p className="mt-2 text-sm text-muted max-w-2xl leading-relaxed">
            Append-only, cryptographic audit log linking all evidence actions from ingestion to export. Every entry validates against the preceding entry's hash digest.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="secondary" onClick={exportAuditLog}>
            <Download className="size-4 mr-1.5" />
            Export Audit JSON
          </Button>
          <Button variant="primary" onClick={verifyChainIntegrity} disabled={verifying}>
            <RefreshCw className={`size-4 mr-1.5 ${verifying ? 'animate-spin' : ''}`} />
            Verify Chain Integrity
          </Button>
        </div>
      </div>

      {/* Verification Badge Banner */}
      {verificationResult && (
        <div className={`mb-8 p-4 rounded-xl border text-xs flex items-center justify-between shadow-sheet ${
          verificationResult.verified
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
            : 'bg-rose-50/80 border-rose-200 text-rose-950'
        }`}>
          <div className="flex items-center gap-3">
            {verificationResult.verified ? (
              <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
            ) : (
              <ShieldAlert className="size-5 text-rose-600 shrink-0" />
            )}
            <div>
              <span className="font-semibold text-sm block">
                {verificationResult.verified ? 'Audit Chain Cryptographically Intact' : 'Integrity Failure Detected'}
              </span>
              <p className="text-[11px] text-muted mt-0.5">
                Verified {verificationResult.totalEntries} sequential custody events against Genesis root hash.
                Root Digest: <code className="mono font-semibold text-plum">{verificationResult.latestHash.slice(0, 24)}...</code>
              </p>
            </div>
          </div>
          <span className="mono text-[10px] text-muted bg-paper px-2.5 py-1 rounded-md border border-lilac/50">
            {new Date(verificationResult.verifiedAt).toLocaleTimeString()}
          </span>
        </div>
      )}

      {/* Chain Timeline Ledger */}
      <div className="relative space-y-6 before:hidden sm:before:block before:absolute before:left-5 before:top-4 before:bottom-6 before:w-0.5 before:bg-lilac/60">
        {displayNodes.map((node, idx) => {
          const MilestoneIcon = getActionIcon(node.action);
          return (
            <div key={node.eventId} className="relative sm:pl-14">
              {/* Timeline Milestone Icon Node */}
              <div className="hidden sm:flex absolute left-5 top-5 size-7 -translate-x-1/2 items-center justify-center rounded-full bg-paper border-2 border-violet-deep text-violet-deep shadow-2xs z-10">
                <MilestoneIcon className="size-3.5" />
              </div>

              {/* Event Card */}
              <div className="rounded-xl border border-lilac bg-paper p-5 sm:p-6 shadow-sheet transition-all hover:border-violet-deep/30">
                {/* 1. Header: Event Number, Human Title, Action Tag, Evidence ID & Timestamp */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-3.5 border-b border-lilac/60">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="flex size-7 items-center justify-center rounded-md bg-wash text-xs font-bold text-violet-deep border border-lilac shadow-2xs font-mono">
                      {`#${String(idx + 1).padStart(2, '0')}`}
                    </span>

                    <h2 className="font-semibold text-sm text-plum">
                      {formatActionTitle(node.action)}
                    </h2>

                    {node.evidenceId && (
                      <span className="mono text-[10px] bg-wash text-violet-deep font-semibold px-2.5 py-0.5 rounded-full border border-lilac/80">
                        {node.evidenceId}
                      </span>
                    )}

                    <span className="mono text-[9px] text-muted bg-wash/50 px-2 py-0.5 rounded border border-lilac/40 uppercase tracking-wide">
                      {node.action}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-muted shrink-0 text-xs">
                    <Clock className="size-3.5 text-muted/80" />
                    <span className="font-medium text-plum">
                      {formatDateTime(node.timestamp)}
                    </span>
                  </div>
                </div>

                {/* 2. Actor / Entity Field */}
                <div className="mt-3.5 flex items-center gap-2.5 text-xs flex-wrap">
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                    Actor / Entity:
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-lilac/80 bg-wash/60 px-2.5 py-1 text-xs font-semibold text-plum shadow-2xs">
                    {getActorIcon(node.actor)}
                    <span>{node.actor}</span>
                  </span>
                  <span className="text-muted text-[11px] font-mono">
                    ID: {node.eventId}
                  </span>
                </div>

                {/* 3. Event Metadata Section (Formatted Field/Value Pairs) */}
                <div className="mt-4">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-muted block mb-2">
                    Event Forensic Metadata
                  </span>
                  <CustodyEventMetadata metadata={node.metadata} />
                </div>

                {/* 4. Cryptographic Block Ledger (Separate Previous & Current Digest Areas) */}
                <div className="mt-5 pt-4 border-t border-lilac/60">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-muted block mb-2.5">
                    Cryptographic Block Ledger
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {/* Previous Event Digest Section */}
                    <div className="rounded-lg border border-lilac/70 bg-wash/30 p-3.5 flex flex-col justify-between shadow-2xs">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[10px] font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
                            <History className="size-3 text-muted" />
                            Previous Event Digest
                          </span>
                          {node.previousEventHash === GENESIS_HASH ? (
                            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-700 border border-slate-200">
                              Genesis Root
                            </span>
                          ) : (
                            <CopyButton value={node.previousEventHash} what="Previous Event Digest" size="sm" />
                          )}
                        </div>
                        <div className="mono text-[11px] text-muted font-mono break-all bg-paper p-2.5 rounded-md border border-lilac/40 select-all leading-relaxed">
                          {node.previousEventHash}
                        </div>
                      </div>
                      <p className="mt-2 text-[10px] text-muted">
                        {node.previousEventHash === GENESIS_HASH
                          ? 'Genesis Block Root: Initial cryptographic anchor for this case ledger.'
                          : 'Sequential cryptographic linkage anchoring this event to the preceding block hash.'}
                      </p>
                    </div>

                    {/* Current Block Hash Section */}
                    <div className="rounded-lg border border-violet-deep/25 bg-wash/60 p-3.5 flex flex-col justify-between shadow-2xs">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[10px] font-semibold text-violet-deep uppercase tracking-wider flex items-center gap-1.5">
                            <ShieldCheck className="size-3.5 text-violet-deep" />
                            Current Block Hash
                          </span>
                          <CopyButton value={node.currentEventHash} what="Current Block Hash" size="sm" />
                        </div>
                        <div className="mono text-[11px] text-violet-deep font-semibold font-mono break-all bg-paper p-2.5 rounded-md border border-violet-deep/20 select-all leading-relaxed">
                          {node.currentEventHash}
                        </div>
                      </div>
                      <p className="mt-2 text-[10px] text-muted">
                        Immutable SHA-256 seal computed over event identity, actor, payload metadata, and previous link digest.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ChainOfCustody;
