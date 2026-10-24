import React, { useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCaseStore } from '../hooks/useCaseStore';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Dialog, DialogContent } from '../components/ui/Dialog';
import EmptyState from '../components/ui/EmptyState';
import { truncateHash, formatBytes, formatDate } from '../lib/utils';
import {
  UploadCloud,
  FileCheck,
  Copy,
  Check,
  RefreshCw,
  Info,
  ShieldAlert,
  ArrowLeft,
  File,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';

export default function EvidenceWorkspace() {
  const { caseId } = useParams();
  const { getCase, getEvidence, addEvidence, reverifyEvidence } = useCaseStore();

  const caseData = getCase(caseId);
  const evidenceList = getEvidence(caseId);

  const fileInputRef = useRef(null);
  const verifyInputRef = useRef(null);

  const [selectedRecord, setSelectedRecord] = useState(null);
  const [reverifyTarget, setReverifyTarget] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [isHashing, setIsHashing] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  if (!caseData) {
    return (
      <EmptyState
        title="Case not found"
        description="The requested case could not be located."
        actionLabel="Back to Cases"
        onAction={() => window.location.href = '/dashboard'}
      />
    );
  }

  // Handle file drop or selection for adding evidence
  async function handleFilesSelected(files) {
    if (!files || files.length === 0) return;
    setIsHashing(true);
    try {
      for (const file of Array.from(files)) {
        await addEvidence(caseId, file);
      }
    } finally {
      setIsHashing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  // Handle re-verification with local file picker
  async function handleReverifyFile(e) {
    const file = e.target.files?.[0];
    if (!file || !reverifyTarget) return;

    const result = await reverifyEvidence(caseId, reverifyTarget.evidenceId, file);
    setVerifyResult({
      fileName: file.name,
      ...result,
    });
    if (verifyInputRef.current) verifyInputRef.current.value = '';
  }

  function triggerReverify(item) {
    setReverifyTarget(item);
    setVerifyResult(null);
    if (verifyInputRef.current) {
      verifyInputRef.current.click();
    }
  }

  function copyToClipboard(text, id) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="space-y-8">
      {/* Hidden file inputs */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        onChange={(e) => handleFilesSelected(e.target.files)}
        className="hidden"
      />
      <input
        type="file"
        ref={verifyInputRef}
        onChange={handleReverifyFile}
        className="hidden"
      />

      {/* Header & Breadcrumb */}
      <div className="space-y-2">
        <Link
          to={`/case/${caseId}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Back to case overview</span>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl sm:text-4xl text-ink font-normal tracking-tight">
              Evidence Workspace
            </h1>
            <p className="text-sm text-muted mt-1">
              Tamper-evident ledger for <span className="text-ink font-medium">{caseData.title}</span>.
            </p>
          </div>

          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isHashing}
            className="gap-2"
          >
            <UploadCloud className="w-4 h-4" aria-hidden="true" />
            <span>{isHashing ? 'Computing hash…' : 'Add evidence file'}</span>
          </Button>
        </div>
      </div>

      {/* Re-verify Result Banner (if just performed) */}
      {verifyResult && (
        <div
          role="status"
          className={`p-4 border rounded-lg text-sm flex items-start justify-between gap-4 ${
            verifyResult.match
              ? 'bg-[#F0F7F3] border-[#C4E3D2] text-[#1F7A4D]'
              : 'bg-[#FDF2F1] border-[#F4C7C3] text-[#A3362E]'
          }`}
        >
          <div className="flex items-start gap-3">
            {verifyResult.match ? (
              <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <div>
              <p className="font-medium">
                {verifyResult.match
                  ? 'Verification Match: The file is identical to the original record.'
                  : 'Verification Mismatch: The submitted file does NOT match the recorded hash!'}
              </p>
              <p className="text-xs mt-1 font-mono break-all opacity-90">
                Computed: {verifyResult.computedHash}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setVerifyResult(null)}
            className="text-xs underline hover:no-underline font-sans cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Plain dashed dropzone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-border hover:border-accent/60 bg-surface/60 rounded-lg p-8 sm:p-10 text-center cursor-pointer transition-colors"
        role="button"
        tabIndex={0}
        aria-label="Upload evidence files by dropping them here or clicking"
      >
        <div className="w-12 h-12 rounded-full bg-accent-soft text-accent flex items-center justify-center mx-auto mb-3">
          <UploadCloud className="w-6 h-6" aria-hidden="true" />
        </div>
        <h3 className="font-serif text-lg text-ink font-normal">
          Drop screenshots, documents, or media files here
        </h3>
        <p className="text-sm text-muted mt-1 max-w-md mx-auto">
          Files are fingerprinted immediately in your browser using SHA-256 before any upload.
        </p>
        <div className="mt-4">
          <Button variant="secondary" size="sm" type="button">
            Browse files
          </Button>
        </div>
      </div>

      {/* Evidence Table (desktop) / Stacked Cards (mobile) */}
      <section aria-labelledby="evidence-list-heading">
        <h2 id="evidence-list-heading" className="sr-only">Preserved Evidence Ledger</h2>

        {evidenceList.length === 0 ? (
          <EmptyState
            title="No evidence records yet"
            description="Add images, PDFs, or communication archives using the dropzone above."
            actionLabel="Add evidence"
            onAction={() => fileInputRef.current?.click()}
          />
        ) : (
          <div className="space-y-4">
            {/* Desktop Table View (sm and up) */}
            <div className="hidden sm:block border border-border rounded-lg overflow-hidden bg-surface">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>SHA-256 Hash</TableHead>
                    <TableHead>Recorded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evidenceList.map((item) => (
                    <TableRow key={item.evidenceId}>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setSelectedRecord(item)}
                          className="text-left group flex items-start gap-2.5 focus-visible:outline-none focus-visible:underline cursor-pointer"
                        >
                          <File className="w-4 h-4 text-muted mt-0.5 shrink-0" aria-hidden="true" />
                          <div>
                            <span className="font-medium text-ink group-hover:text-accent transition-colors">
                              {item.fileName}
                            </span>
                            <span className="block text-xs text-muted font-mono mt-0.5">
                              {formatBytes(item.sizeBytes)} • {item.mimeType}
                            </span>
                          </div>
                        </button>
                      </TableCell>

                      <TableCell>
                        <Badge status={item.verificationStatus} />
                      </TableCell>

                      <TableCell>
                        <div className="inline-flex items-center gap-1.5 font-mono text-xs text-muted bg-[#F7F5F0] px-2 py-1 rounded border border-border/80">
                          <span>{truncateHash(item.sha256, 8)}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(item.sha256, item.evidenceId);
                            }}
                            title="Copy full 64-char hash"
                            className="p-1 hover:text-ink transition-colors cursor-pointer"
                          >
                            {copiedId === item.evidenceId ? (
                              <Check className="w-3.5 h-3.5 text-verified" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </TableCell>

                      <TableCell className="text-xs text-muted">
                        {formatDate(item.recordedAt)}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => triggerReverify(item)}
                            title="Test local file against recorded hash"
                            className="text-xs text-muted hover:text-ink"
                          >
                            <RefreshCw className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                            Re-verify
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSelectedRecord(item)}
                            className="text-xs"
                          >
                            Details
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Stacked View (< sm) */}
            <div className="sm:hidden space-y-3">
              {evidenceList.map((item) => (
                <div
                  key={item.evidenceId}
                  className="bg-surface border border-border rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedRecord(item)}
                      className="text-left font-medium text-ink hover:text-accent"
                    >
                      {item.fileName}
                    </button>
                    <Badge status={item.verificationStatus} />
                  </div>

                  <div className="text-xs text-muted flex items-center justify-between">
                    <span>{formatBytes(item.sizeBytes)}</span>
                    <span>{formatDate(item.recordedAt)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                    <div className="font-mono text-xs text-muted">
                      {truncateHash(item.sha256, 6)}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => triggerReverify(item)}
                        className="text-xs"
                      >
                        Re-verify
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedRecord(item)}
                        className="text-xs"
                      >
                        Details
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Honest Limits Notice */}
      <div className="p-4 rounded-lg border border-border bg-surface text-xs text-muted flex items-start gap-3">
        <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
        <p className="leading-relaxed">
          <strong className="text-ink font-medium">Cryptographic note:</strong> A matching SHA-256 hash confirms that the file contents have remained unaltered byte-for-byte since it was cataloged. It does not establish the external origin or legal weight of the document.
        </p>
      </div>

      {/* Radix Dialog for Evidence Details */}
      <Dialog open={!!selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)}>
        {selectedRecord && (
          <DialogContent
            title={selectedRecord.fileName}
            description="Cryptographic fingerprint and integrity metadata."
          >
            <div className="space-y-5 mt-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase text-muted">Integrity:</span>
                <Badge status={selectedRecord.verificationStatus} />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted">
                  SHA-256 Fingerprint (64 hexadecimal characters)
                </label>
                <div className="p-3 bg-[#F7F5F0] border border-border rounded font-mono text-xs text-ink break-all select-all flex items-start justify-between gap-2">
                  <span>{selectedRecord.sha256}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(selectedRecord.sha256, 'modal')}
                    className="p-1 hover:text-accent shrink-0"
                    title="Copy full hash"
                  >
                    {copiedId === 'modal' ? (
                      <Check className="w-4 h-4 text-verified" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted" />
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border text-xs">
                <div>
                  <span className="text-muted block">File Size</span>
                  <span className="font-medium text-ink font-mono">{formatBytes(selectedRecord.sizeBytes)}</span>
                </div>
                <div>
                  <span className="text-muted block">MIME Type</span>
                  <span className="font-medium text-ink font-mono">{selectedRecord.mimeType}</span>
                </div>
                <div>
                  <span className="text-muted block">Recorded Timestamp</span>
                  <span className="font-medium text-ink">{formatDate(selectedRecord.recordedAt)}</span>
                </div>
                <div>
                  <span className="text-muted block">Internal ID</span>
                  <span className="font-medium text-ink font-mono">{selectedRecord.evidenceId}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const rec = selectedRecord;
                    setSelectedRecord(null);
                    triggerReverify(rec);
                  }}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                  Re-verify with file
                </Button>

                <Button variant="ghost" onClick={() => setSelectedRecord(null)}>
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
