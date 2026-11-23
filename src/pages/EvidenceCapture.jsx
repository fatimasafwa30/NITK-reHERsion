import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Globe,
  Shield,
  ShieldCheck,
  UploadCloud,
  FileUp,
  FileText,
  AlertCircle,
  X,
  RefreshCw,
  ExternalLink,
  Music,
  Video,
  Image as ImageIcon,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ArrowLeft,
  FileSearch,
} from 'lucide-react';
import { useVera } from '../store/VeraStore';
import { useToast } from '../store/ToastProvider';
import { Button } from '../components/ui/Button';
import { CopyButton } from '../components/HashDisplay';
import { sha256File, MAX_FILE_BYTES } from '../lib/hash';
import { formatBytes, formatDateTime } from '../lib/format';
import { isBackendOnline, sealEvidenceToBackend } from '../services/apiClient';

const SUPPORTED_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp',
  'mp4', 'webm', 'mov',
  'mp3', 'wav', 'ogg', 'm4a',
  'pdf',
  'txt',
];

const SUPPORTED_MIME_PREFIXES = [
  'image/',
  'video/',
  'audio/',
  'application/pdf',
  'text/plain',
];

function isFileTypeSupported(file) {
  if (!file) return false;
  if (file.type && SUPPORTED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))) {
    return true;
  }
  const ext = (file.name || '').split('.').pop()?.toLowerCase();
  return ext ? SUPPORTED_EXTENSIONS.includes(ext) : false;
}

function detectPlatformFromUrl(url = '') {
  if (!url) return 'Other';
  const l = url.toLowerCase();
  if (l.includes('instagram.com')) return 'Instagram';
  if (l.includes('whatsapp.com')) return 'WhatsApp';
  if (l.includes('mail.google.com') || l.includes('outlook') || l.includes('proton')) return 'Email';
  if (l.includes('t.me') || l.includes('telegram')) return 'Telegram';
  if (l.includes('twitter.com') || l.includes('x.com')) return 'Twitter / X';
  if (l.includes('discord.com')) return 'Discord';
  return 'Other';
}

function getLocalDatetimeString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
}

export function EvidenceCapture() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const { getCase, addEvidence } = useVera();
  const toast = useToast();

  const caseData = getCase(caseId);

  // Workflow Stages: 'INTAKE' (1) -> 'REVIEW' (2) -> 'SUCCESS' (3)
  const [stage, setStage] = useState('INTAKE');

  // Extension Integration State
  const [extensionStatus, setExtensionStatus] = useState('CHECKING'); // 'CHECKING' | 'CONNECTED' | 'NOT_DETECTED'
  const [extensionError, setExtensionError] = useState(null);
  const [capturingTab, setCapturingTab] = useState(false);

  // File & Hash State (Original file preserved)
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [textExcerpt, setTextExcerpt] = useState('');
  const [computedHash, setComputedHash] = useState('');
  const [hashingProgress, setHashingProgress] = useState(0);
  const [fileValidationError, setFileValidationError] = useState(null);

  // Incident Metadata Fields
  const [platform, setPlatform] = useState('Instagram');
  const [senderHandle, setSenderHandle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [captureTimestamp, setCaptureTimestamp] = useState(getLocalDatetimeString());
  const [notes, setContextNotes] = useState('');
  const [submissionSource, setSubmissionSource] = useState('USER_SUBMITTED');
  const [submissionMethod, setSubmissionMethod] = useState('MANUAL_DROPZONE');

  // Sealing / Submission Execution State
  const [sealing, setSealing] = useState(false);
  const [sealingError, setSealingError] = useState(null);
  const [sealedDetails, setSealedDetails] = useState(null);

  // Expandable Help & Troubleshooting State
  const [showHelp, setShowHelp] = useState(false);

  // Drag & drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef(null);

  // 1. Detect Chrome Companion Extension on Mount
  useEffect(() => {
    let unmounted = false;

    const checkDomIndicator = () => {
      if (document.documentElement.getAttribute('data-veratrace-extension')) {
        if (!unmounted) setExtensionStatus('CONNECTED');
        return true;
      }
      return false;
    };

    if (checkDomIndicator()) return;

    // Ping content script
    window.postMessage({ type: 'VERATRACE_PING_EXTENSION' }, '*');

    const handleMessage = (event) => {
      if (event.source !== window || !event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'VERATRACE_PONG_EXTENSION' || event.data.type === 'VERATRACE_EXTENSION_READY') {
        if (!unmounted) setExtensionStatus('CONNECTED');
      }
    };

    window.addEventListener('message', handleMessage);

    const timeout = setTimeout(() => {
      if (!unmounted && !checkDomIndicator()) {
        setExtensionStatus('NOT_DETECTED');
      }
    }, 600);

    return () => {
      unmounted = true;
      window.removeEventListener('message', handleMessage);
      clearTimeout(timeout);
    };
  }, []);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Handle incoming file selection & validate
  const processSelectedFile = useCallback(async (file, source = 'USER_SUBMITTED', method = 'MANUAL_DROPZONE', initialUrl = '') => {
    setFileValidationError(null);
    setSealingError(null);

    if (!file) return;

    // 1. Enforce 50 MB limit
    if (file.size > MAX_FILE_BYTES) {
      setFileValidationError(`File "${file.name}" is ${formatBytes(file.size)}, which exceeds the 50 MB limit.`);
      return;
    }

    // 2. Reject empty files
    if (file.size === 0) {
      setFileValidationError(`File "${file.name}" is empty (0 bytes). Evidence files must contain valid data.`);
      return;
    }

    // 3. Validate supported container formats
    if (!isFileTypeSupported(file)) {
      const ext = (file.name || '').split('.').pop() || 'unknown';
      setFileValidationError(`Unsupported file type (.${ext}). Supported formats: PNG, JPG, WEBP, MP4, WEBM, MP3, WAV, PDF, TXT.`);
      return;
    }

    // Clean up previous preview URL
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setSubmissionSource(source);
    setSubmissionMethod(method);

    if (initialUrl) {
      setSourceUrl(initialUrl);
      const detected = detectPlatformFromUrl(initialUrl);
      if (detected !== 'Other') setPlatform(detected);
    }

    // Generate supported preview
    if (file.type?.startsWith('image/')) {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      setTextExcerpt('');
    } else if (file.type?.startsWith('video/') || file.type?.startsWith('audio/')) {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      setTextExcerpt('');
    } else if (file.type === 'text/plain') {
      setPreviewUrl(null);
      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = (e.target?.result || '').slice(0, 1000);
          setTextExcerpt(text);
        };
        reader.readAsText(file.slice(0, 2048));
      } catch {
        setTextExcerpt('Text file preview unavailable.');
      }
    } else {
      setPreviewUrl(null);
      setTextExcerpt('');
    }

    // Calculate genuine SHA-256 fingerprint with honest progress reporting
    setComputedHash('Computing SHA-256...');
    setHashingProgress(0);
    try {
      const hash = await sha256File(file, (progress) => {
        setHashingProgress(Math.round(progress * 100));
      });
      setComputedHash(hash);
      setHashingProgress(100);
    } catch (err) {
      setComputedHash('Calculation error');
      setFileValidationError(`Failed to compute SHA-256: ${err.message}`);
    }

    // Transition to Stage 2: REVIEW
    setStage('REVIEW');
  }, [previewUrl]);

  // 2. Action: Capture Visible Active Tab via Companion Extension
  const handleCaptureCurrentTab = async () => {
    setExtensionError(null);
    setFileValidationError(null);

    // If extension is not detected, never pretend capture succeeded
    if (extensionStatus !== 'CONNECTED') {
      setExtensionError('The VeraTrace Chrome Companion Extension is not detected in your browser. Please install or enable the extension (see Setup Instructions below) to capture browser tabs directly, or use Manual Evidence Upload.');
      setShowHelp(true);
      return;
    }

    setCapturingTab(true);

    const messageHandler = (event) => {
      if (event.source !== window || !event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'VERATRACE_CAPTURE_CURRENT_TAB_RESPONSE') {
        window.removeEventListener('message', messageHandler);
        setCapturingTab(false);

        if (!event.data.success || !event.data.dataUrl) {
          setExtensionError(`Capture failed: ${event.data.error || 'The active tab could not be captured.'}`);
          return;
        }

        try {
          // Convert dataURL to Blob & File
          const arr = event.data.dataUrl.split(',');
          const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
          const bstr = atob(arr[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          const blob = new Blob([u8arr], { type: mime });
          const capturedFilename = `tab_capture_${Date.now()}.png`;
          const file = new File([blob], capturedFilename, { type: 'image/png' });

          const capturedUrl = event.data.url || window.location.href;
          const capturedTimestamp = event.data.timestamp
            ? getLocalDatetimeString(new Date(event.data.timestamp))
            : getLocalDatetimeString();

          setCaptureTimestamp(capturedTimestamp);
          processSelectedFile(file, 'EXTENSION_CAPTURE', 'CHROME_EXT_MV3', capturedUrl);
          toast('Browser tab captured. Review evidence before sealing.', { tone: 'success' });
        } catch (err) {
          setExtensionError(`Failed to process captured tab: ${err.message}`);
        }
      }
    };

    window.addEventListener('message', messageHandler);

    // Timeout guard (6 seconds)
    setTimeout(() => {
      window.removeEventListener('message', messageHandler);
      setCapturingTab((current) => {
        if (current) {
          setExtensionError('Companion extension timed out without responding. Please reload the extension in chrome://extensions.');
          return false;
        }
        return false;
      });
    }, 6000);

    window.postMessage({ type: 'VERATRACE_CAPTURE_CURRENT_TAB_REQUEST' }, '*');
  };

  // Drag and Drop Event Handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      setIsDragging(false);
      dragCounter.current = 0;
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0], 'USER_SUBMITTED', 'MANUAL_DROPZONE');
    }
  };

  // Browse Files Native Input Change
  const handleFileInputChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0], 'USER_SUBMITTED', 'MANUAL_DROPZONE');
    }
    e.target.value = '';
  };

  // Reset / Discard Selection
  const handleDiscardSelection = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setTextExcerpt('');
    setComputedHash('');
    setHashingProgress(0);
    setFileValidationError(null);
    setSealingError(null);
    setStage('INTAKE');
  };

  // Full Reset for Another Ingestion
  const handleResetWorkflow = () => {
    handleDiscardSelection();
    setSenderHandle('');
    setSourceUrl('');
    setCaptureTimestamp(getLocalDatetimeString());
    setContextNotes('');
    setSealedDetails(null);
    setStage('INTAKE');
  };

  // 3. Action: Seal Evidence — Critical Genuine Sealing Flow
  const handleSealEvidence = async (e) => {
    e?.preventDefault();

    if (!selectedFile) {
      setFileValidationError('Please select or capture a valid evidence file before sealing.');
      return;
    }

    if (!caseId) {
      setSealingError('No target case specified. Cannot seal unlinked evidence.');
      return;
    }

    setSealing(true);
    setSealingError(null);

    const nowIso = new Date().toISOString();
    const finalCaptureIso = captureTimestamp ? new Date(captureTimestamp).toISOString() : nowIso;

    // Check backend status first
    const online = await isBackendOnline(true);

    if (!online) {
      // Backend is unavailable — strictly follow requirement:
      // "If the backend is unavailable, show an explicit failure and preserve the user's selected file and metadata where safe."
      setSealing(false);
      setSealingError(
        'VeraTrace Backend Vault Unavailable: Unable to connect to http://localhost:4000/api. Your selected file and incident metadata have been preserved. Please start the backend service (node server/server.js) and retry sealing.'
      );
      toast('Backend vault unavailable. Your file and metadata are preserved.', { tone: 'error' });
      return;
    }

    try {
      // 1. Package real FormData for backend vault endpoint
      const clientEvidenceId = `ev_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const formData = new FormData();
      formData.append('evidenceId', clientEvidenceId);
      formData.append('file', selectedFile, selectedFile.name);
      formData.append('platform', platform);
      formData.append('senderHandle', senderHandle.trim());
      formData.append('sourceUrl', sourceUrl.trim());
      formData.append('captureTimestamp', finalCaptureIso);
      formData.append('notes', notes.trim());
      formData.append('submissionSource', submissionSource);
      formData.append('submissionMethod', submissionMethod);

      // 2. Transmit to real backend vault storage
      const serverResponse = await sealEvidenceToBackend(caseId, formData);

      const serverEvidence = serverResponse?.evidence || {};

      // 3. Synchronize with client store so Case Vault updates without requiring page refresh
      await addEvidence(caseId, {
        evidenceId: serverEvidence.evidence_id || clientEvidenceId,
        fileName: serverEvidence.original_filename || selectedFile.name,
        originalFilename: selectedFile.name,
        mimeType: serverEvidence.file_type || selectedFile.type || 'application/octet-stream',
        sizeBytes: selectedFile.size,
        sha256: serverEvidence.sha256_hash || computedHash,
        recordedAt: serverEvidence.upload_timestamp || nowIso,
        uploadTimestamp: serverEvidence.upload_timestamp || nowIso,
        captureTimestamp: finalCaptureIso,
        platform,
        senderHandle: senderHandle.trim() || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
        notes: notes.trim() || undefined,
        previewUrl,
        submissionSource,
        submissionMethod,
        userClaimedSource: sourceUrl.trim() || undefined,
      }, selectedFile);

      setSealedDetails({
        evidenceId: serverEvidence.evidence_id || clientEvidenceId,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        mimeType: selectedFile.type || 'application/octet-stream',
        sha256: serverEvidence.sha256_hash || computedHash,
        uploadTimestamp: serverEvidence.upload_timestamp || nowIso,
        captureTimestamp: finalCaptureIso,
        platform,
        senderHandle: senderHandle.trim(),
        sourceUrl: sourceUrl.trim(),
        notes: notes.trim(),
        vaultPath: serverResponse?.fileVersion?.storagePath || 'Encrypted Vault Storage',
      });

      setStage('SUCCESS');
      toast('Evidence sealed with SHA-256 fingerprint in Case Vault.', { tone: 'success' });
    } catch (err) {
      setSealingError(`Vault Ingestion Rejected: ${err.message}`);
      toast(`Sealing failed: ${err.message}`, { tone: 'error' });
    } finally {
      setSealing(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
      {/* Navigation Breadcrumb */}
      <div className="mb-6 flex items-center justify-between text-xs text-muted">
        <div className="flex items-center gap-2">
          <Link to={`/case/${caseId}`} className="hover:text-plum font-medium transition-colors">
            Case {caseId}
          </Link>
          <span>/</span>
          <span className="text-plum font-semibold">Evidence Ingestion</span>
        </div>
        <Link
          to={`/case/${caseId}/evidence`}
          className="hover:text-plum inline-flex items-center gap-1.5 font-medium transition-colors"
        >
          <FileSearch className="size-3.5" />
          View Case Vault
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="display-lg text-plum">
          Capture & Ingest <em className="italic">Digital Evidence</em>
        </h1>
        <p className="mt-2 text-sm text-muted max-w-2xl leading-relaxed">
          Collect communications and recordings without altering original files. Every intake receives an immutable SHA-256 fingerprint, encrypted vault preservation, and append-only chain of custody anchoring.
        </p>
      </div>

      {/* 3-Stage Progress Indicator */}
      <div className="mb-8 rounded-lg border border-lilac bg-paper p-3 shadow-sheet">
        <div className="grid grid-cols-3 gap-2 text-center text-xs font-medium">
          <div
            className={`rounded-md py-2 px-3 transition-colors ${
              stage === 'INTAKE'
                ? 'bg-wash text-violet-deep font-semibold border border-lilac'
                : selectedFile
                ? 'text-plum bg-wash/40'
                : 'text-muted'
            }`}
          >
            <span className="mono mr-1.5 text-[10px]">01</span>
            Capture / Upload
          </div>
          <div
            className={`rounded-md py-2 px-3 transition-colors ${
              stage === 'REVIEW'
                ? 'bg-wash text-violet-deep font-semibold border border-lilac'
                : stage === 'SUCCESS'
                ? 'text-plum bg-wash/40'
                : 'text-muted'
            }`}
          >
            <span className="mono mr-1.5 text-[10px]">02</span>
            Review & Metadata
          </div>
          <div
            className={`rounded-md py-2 px-3 transition-colors ${
              stage === 'SUCCESS'
                ? 'bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200'
                : 'text-muted'
            }`}
          >
            <span className="mono mr-1.5 text-[10px]">03</span>
            Vault Sealing
          </div>
        </div>
      </div>

      {/* STAGE 1: INTAKE (BROWSER CAPTURE & MANUAL UPLOAD) */}
      {stage === 'INTAKE' && (
        <div className="space-y-6">
          {/* Extension Error Alert */}
          {extensionError && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 shadow-sm flex items-start gap-3">
              <AlertCircle className="size-5 shrink-0 text-amber-600 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block mb-0.5">Chrome Extension Notice</span>
                <p className="leading-relaxed">{extensionError}</p>
              </div>
              <button
                type="button"
                onClick={() => setExtensionError(null)}
                className="text-amber-700 hover:text-amber-950 p-1"
                aria-label="Dismiss error"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {/* Validation Error Alert */}
          {fileValidationError && (
            <div className="rounded-lg border border-alert/30 bg-alert-wash p-4 text-xs text-alert shadow-sm flex items-start gap-3">
              <AlertCircle className="size-5 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block mb-0.5">Invalid Evidence File</span>
                <p className="leading-relaxed">{fileValidationError}</p>
              </div>
              <button
                type="button"
                onClick={() => setFileValidationError(null)}
                className="text-alert hover:text-alert/80 p-1"
                aria-label="Dismiss error"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* 1. Browser Companion Capture */}
            <div className="lg:col-span-5 flex flex-col justify-between rounded-lg border border-lilac bg-paper p-6 shadow-sheet">
              <div>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-9 items-center justify-center rounded-md bg-wash text-violet-deep border border-lilac">
                      <Globe className="size-4.5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-plum">Browser Companion</h2>
                      <p className="text-[11px] text-muted">Manifest V3 Intake Tool</p>
                    </div>
                  </div>

                  {/* Extension Status Badge */}
                  {extensionStatus === 'CONNECTED' ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800">
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </span>
                  ) : extensionStatus === 'CHECKING' ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-lilac bg-wash px-2.5 py-0.5 text-[11px] text-muted">
                      <RefreshCw className="size-3 animate-spin" />
                      Checking...
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
                      <span className="size-1.5 rounded-full bg-amber-500" />
                      Not Detected
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted leading-relaxed mb-4">
                  Capture the visible browser tab directly into this case. Extracts active URL, timestamp, and computes client SHA-256 on demand.
                </p>

                <div className="rounded-md bg-wash/60 border border-lilac/70 p-3 text-[11px] text-muted space-y-1.5">
                  <div className="flex items-start gap-1.5">
                    <Shield className="size-3.5 text-violet-deep shrink-0 mt-0.5" />
                    <span>Uses strict <code>activeTab</code> permissions only upon explicit user click. Never tracks browsing history.</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-lilac/60">
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleCaptureCurrentTab}
                  disabled={capturingTab}
                  className="w-full"
                >
                  {capturingTab ? (
                    <>
                      <RefreshCw className="size-4 animate-spin mr-2" />
                      Capturing Active Tab...
                    </>
                  ) : (
                    <>
                      <Globe className="size-4 mr-2" />
                      Capture Current Tab
                    </>
                  )}
                </Button>
                {extensionStatus === 'NOT_DETECTED' && (
                  <p className="mt-2 text-center text-[10px] text-amber-800">
                    Extension not detected. Click below for installation steps.
                  </p>
                )}
              </div>
            </div>

            {/* 2. Manual Evidence Upload */}
            <div className="lg:col-span-7 rounded-lg border border-lilac bg-paper p-6 shadow-sheet flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="flex size-9 items-center justify-center rounded-md bg-wash text-violet-deep border border-lilac">
                    <UploadCloud className="size-4.5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-plum">Manual File Intake</h2>
                    <p className="text-[11px] text-muted">Original Screenshots, Chat Archives, Video, Audio, or PDFs</p>
                  </div>
                </div>

                {/* Dropzone Container */}
                <div
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`mt-4 relative rounded-lg border-2 border-dashed p-8 text-center transition-all ${
                    isDragging
                      ? 'border-violet-deep bg-wash scale-[0.99]'
                      : 'border-lilac bg-wash/30 hover:border-violet-deep/60'
                  }`}
                >
                  <FileUp className="mx-auto size-8 text-violet-deep mb-3 stroke-[1.5]" />
                  <p className="text-xs font-semibold text-plum mb-1">
                    {isDragging ? 'Release to Intake Evidence' : 'Drag & drop evidence file here'}
                  </p>
                  <p className="text-[11px] text-muted mb-4">
                    Supports PNG, JPG, WEBP, MP4, WEBM, MP3, WAV, PDF, TXT
                  </p>

                  <div className="flex items-center justify-center gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <UploadCloud className="size-3.5 mr-1.5" />
                      Browse Files
                    </Button>
                    <span className="mono text-[10px] text-muted">Up to 50 MB limit</span>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    accept="image/*,video/*,audio/*,application/pdf,text/plain"
                    onChange={handleFileInputChange}
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-[11px] text-muted pt-3 border-t border-lilac/60">
                <span>Original file bytes are preserved without alteration.</span>
                <span className="mono font-medium text-plum">SHA-256 Calculated Locally</span>
              </div>
            </div>
          </div>

          {/* Compact Expandable Help & Extension Setup Section */}
          <div className="rounded-lg border border-lilac/70 bg-paper/60 p-4 shadow-sm">
            <button
              type="button"
              onClick={() => setShowHelp((prev) => !prev)}
              className="w-full flex items-center justify-between text-left text-xs font-semibold text-plum hover:text-violet-deep transition-colors"
            >
              <span className="flex items-center gap-2">
                <Shield className="size-4 text-violet-deep" />
                Extension Setup & Troubleshooting Guide
              </span>
              {showHelp ? <ChevronUp className="size-4 text-muted" /> : <ChevronDown className="size-4 text-muted" />}
            </button>

            {showHelp && (
              <div className="mt-3 pt-3 border-t border-lilac/60 text-xs text-muted space-y-3">
                <p className="leading-relaxed">
                  The VeraTrace Companion Extension allows capturing online harassment evidence directly from the browser window while browsing supported platforms.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded border border-lilac bg-wash/60 p-3">
                    <span className="mono font-semibold text-[10px] text-violet-deep block mb-1">STEP 1</span>
                    <p className="text-[11px]">Open <code>chrome://extensions</code> in Chrome, Edge, or Brave.</p>
                  </div>
                  <div className="rounded border border-lilac bg-wash/60 p-3">
                    <span className="mono font-semibold text-[10px] text-violet-deep block mb-1">STEP 2</span>
                    <p className="text-[11px]">Enable <strong>Developer mode</strong> using the toggle in the top-right.</p>
                  </div>
                  <div className="rounded border border-lilac bg-wash/60 p-3">
                    <span className="mono font-semibold text-[10px] text-violet-deep block mb-1">STEP 3</span>
                    <p className="text-[11px]">Click <strong>Load unpacked</strong> and select the <code>extension/</code> folder in this project.</p>
                  </div>
                </div>
                <div className="text-[11px] text-muted bg-wash/40 p-2.5 rounded border border-lilac/60 flex items-center justify-between">
                  <span>After loading the extension, reload this page to connect automatically.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setExtensionStatus('CHECKING');
                      window.postMessage({ type: 'VERATRACE_PING_EXTENSION' }, '*');
                      setTimeout(() => {
                        if (document.documentElement.getAttribute('data-veratrace-extension')) {
                          setExtensionStatus('CONNECTED');
                        } else {
                          setExtensionStatus('NOT_DETECTED');
                        }
                      }, 500);
                    }}
                    className="mono font-semibold text-violet-deep hover:underline"
                  >
                    Re-check Connection
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STAGE 2: REVIEW & METADATA */}
      {stage === 'REVIEW' && selectedFile && (
        <form onSubmit={handleSealEvidence} className="space-y-6">
          {/* Sealing Error Alert */}
          {sealingError && (
            <div className="rounded-lg border border-alert/30 bg-alert-wash p-4 text-xs text-alert shadow-sm flex items-start gap-3">
              <AlertCircle className="size-5 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block mb-0.5">Sealing Issue</span>
                <p className="leading-relaxed">{sealingError}</p>
              </div>
              <button
                type="button"
                onClick={() => setSealingError(null)}
                className="text-alert hover:text-alert/80 p-1"
                aria-label="Dismiss error"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Column: Artifact Preview & Cryptographic Verification */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-lg border border-lilac bg-paper p-5 shadow-sheet">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold text-plum uppercase tracking-wider">Evidence Artifact</h2>
                  <span className="mono text-[10px] text-violet-deep bg-wash px-2 py-0.5 rounded border border-lilac">
                    {submissionMethod === 'CHROME_EXT_MV3' ? 'Extension Capture' : 'Manual File'}
                  </span>
                </div>

                {/* File Preview Element */}
                <div className="overflow-hidden rounded-md border border-lilac bg-wash/30 p-2 min-h-[180px] flex items-center justify-center">
                  {previewUrl && selectedFile.type?.startsWith('image/') ? (
                    <img
                      src={previewUrl}
                      alt={selectedFile.name}
                      className="max-h-64 w-full rounded object-contain bg-paper"
                    />
                  ) : previewUrl && selectedFile.type?.startsWith('video/') ? (
                    <video controls src={previewUrl} className="max-h-64 w-full rounded bg-black" />
                  ) : previewUrl && selectedFile.type?.startsWith('audio/') ? (
                    <div className="w-full p-4 text-center">
                      <Music className="size-10 text-violet-deep mx-auto mb-2" />
                      <audio controls src={previewUrl} className="w-full mt-2" />
                    </div>
                  ) : selectedFile.type === 'application/pdf' ? (
                    <div className="p-6 text-center">
                      <FileText className="size-12 text-violet-deep mx-auto mb-2" />
                      <span className="mono text-xs font-semibold text-plum block">{selectedFile.name}</span>
                      <span className="text-[11px] text-muted">PDF Document</span>
                    </div>
                  ) : textExcerpt ? (
                    <div className="w-full p-3 font-mono text-[11px] text-plum/90 bg-paper rounded max-h-48 overflow-y-auto whitespace-pre-wrap">
                      {textExcerpt}
                    </div>
                  ) : (
                    <div className="p-6 text-center">
                      <FileText className="size-12 text-muted mx-auto mb-2" />
                      <span className="mono text-xs font-semibold text-plum block">{selectedFile.name}</span>
                    </div>
                  )}
                </div>

                {/* File Information Specs */}
                <div className="mt-4 space-y-2 border-t border-lilac/60 pt-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted">Filename:</span>
                    <span className="mono font-semibold text-plum truncate max-w-[200px]" title={selectedFile.name}>
                      {selectedFile.name}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted">File Size:</span>
                    <span className="mono font-semibold text-plum">{formatBytes(selectedFile.size)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted">Container Type:</span>
                    <span className="mono text-muted">{selectedFile.type || 'application/octet-stream'}</span>
                  </div>
                </div>

                {/* SHA-256 Fingerprint Display */}
                <div className="mt-4 rounded-md bg-wash p-3 border border-lilac text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="mono text-[10px] font-semibold text-violet-deep uppercase">
                      Client SHA-256 Fingerprint
                    </span>
                    {computedHash && computedHash.length === 64 && (
                      <CopyButton value={computedHash} what="SHA-256 Hash" />
                    )}
                  </div>
                  <div className="mono text-[11px] text-plum break-all leading-tight bg-paper p-2 rounded border border-lilac/60">
                    {computedHash || `Computing digest (${hashingProgress}%)...`}
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted">
                    Calculated over raw binary stream using Web Cryptography API.
                  </p>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Replace File
                  </Button>
                  <Button
                    type="button"
                    variant="quiet"
                    size="sm"
                    onClick={handleDiscardSelection}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>

            {/* Right Column: Incident Metadata */}
            <div className="lg:col-span-7">
              <div className="rounded-lg border border-lilac bg-paper p-6 shadow-sheet">
                <h2 className="text-sm font-semibold text-plum mb-1">Incident Context & Metadata</h2>
                <p className="text-xs text-muted mb-5 leading-relaxed">
                  Record observational details regarding the origin and context of this communication. These fields are cryptographically linked in the chain-of-custody audit log.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Platform Channel */}
                  <div>
                    <label className="block text-xs font-medium text-plum mb-1">Platform Channel</label>
                    <select
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value)}
                      className="w-full rounded-md border border-lilac bg-ivory px-3 py-2 text-xs text-plum outline-none focus:border-violet-deep transition-colors"
                    >
                      <option value="Instagram">Instagram</option>
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="Email">Email</option>
                      <option value="SMS / Text">SMS / Text</option>
                      <option value="Telegram">Telegram</option>
                      <option value="Twitter / X">Twitter / X</option>
                      <option value="Discord">Discord</option>
                      <option value="Other">Other Channel</option>
                    </select>
                  </div>

                  {/* Sender Handle */}
                  <div>
                    <label className="block text-xs font-medium text-plum mb-1">Sender Handle / Identifier</label>
                    <input
                      type="text"
                      value={senderHandle}
                      onChange={(e) => setSenderHandle(e.target.value)}
                      placeholder="@username, phone number, or handle"
                      className="w-full rounded-md border border-lilac bg-ivory px-3 py-2 text-xs text-plum outline-none focus:border-violet-deep transition-colors"
                    />
                  </div>

                  {/* Source URL */}
                  <div>
                    <label className="block text-xs font-medium text-plum mb-1">Source URL (Optional)</label>
                    <input
                      type="url"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full rounded-md border border-lilac bg-ivory px-3 py-2 text-xs text-plum outline-none focus:border-violet-deep transition-colors"
                    />
                  </div>

                  {/* Incident Capture Time */}
                  <div>
                    <label className="block text-xs font-medium text-plum mb-1">Incident Capture Time</label>
                    <input
                      type="datetime-local"
                      value={captureTimestamp}
                      onChange={(e) => setCaptureTimestamp(e.target.value)}
                      className="w-full rounded-md border border-lilac bg-ivory px-3 py-2 text-xs text-plum outline-none focus:border-violet-deep transition-colors"
                    />
                  </div>
                </div>

                {/* Contextual Incident Notes */}
                <div className="mt-4">
                  <label className="block text-xs font-medium text-plum mb-1">Contextual Incident Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setContextNotes(e.target.value)}
                    rows={3}
                    placeholder="Describe what occurred (e.g. Unwanted contact received immediately following an explicit block on another platform)."
                    className="w-full rounded-md border border-lilac bg-ivory px-3 py-2 text-xs text-plum outline-none focus:border-violet-deep transition-colors"
                  />
                </div>

                {/* Timestamp Distinction Banner */}
                <div className="mt-4 rounded-md bg-wash/50 border border-lilac/70 p-3 text-[11px] text-muted flex items-start gap-2">
                  <AlertCircle className="size-4 text-violet-deep shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong className="text-plum">Capture vs Upload Time:</strong> Incident Capture Time records when the communication or event occurred. Cryptographic Upload Time is recorded when sealed in the vault.
                  </p>
                </div>

                {/* Sealing Submission Controls */}
                <div className="mt-6 flex items-center justify-between pt-4 border-t border-lilac">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleDiscardSelection}
                    disabled={sealing}
                  >
                    <ArrowLeft className="size-3.5 mr-1" />
                    Back
                  </Button>

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={sealing || !selectedFile || (computedHash && computedHash.startsWith('Computing'))}
                  >
                    {sealing ? (
                      <>
                        <RefreshCw className="size-4 animate-spin mr-2" />
                        Sealing in Vault...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="size-4 mr-2" />
                        Seal Evidence in Vault
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* STAGE 3: SUCCESS CONFIRMATION */}
      {stage === 'SUCCESS' && sealedDetails && (
        <div className="rounded-lg border border-emerald-200 bg-paper p-8 shadow-sheet text-center max-w-2xl mx-auto space-y-6">
          <div className="flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 mx-auto">
            <CheckCircle2 className="size-7" />
          </div>

          <div>
            <h2 className="display-md text-plum">Evidence Successfully Sealed</h2>
            <p className="mt-1 text-xs text-muted">
              Preserved in encrypted vault storage with tamper-evident chain of custody registration.
            </p>
          </div>

          <div className="rounded-md bg-wash p-4 border border-lilac text-left text-xs space-y-2.5">
            <div className="flex justify-between items-center border-b border-lilac/50 pb-2">
              <span className="text-muted">Evidence ID:</span>
              <span className="mono font-semibold text-plum">{sealedDetails.evidenceId}</span>
            </div>
            <div className="flex justify-between items-center border-b border-lilac/50 pb-2">
              <span className="text-muted">File:</span>
              <span className="mono font-semibold text-plum">{sealedDetails.fileName} ({formatBytes(sealedDetails.fileSize)})</span>
            </div>
            <div className="flex justify-between items-center border-b border-lilac/50 pb-2">
              <span className="text-muted">SHA-256 Digest:</span>
              <div className="flex items-center gap-1.5">
                <span className="mono text-[11px] text-plum truncate max-w-[220px]" title={sealedDetails.sha256}>
                  {sealedDetails.sha256}
                </span>
                <CopyButton value={sealedDetails.sha256} what="SHA-256 Digest" />
              </div>
            </div>
            <div className="flex justify-between items-center border-b border-lilac/50 pb-2">
              <span className="text-muted">Incident Capture Time:</span>
              <span className="mono text-plum">{formatDateTime(sealedDetails.captureTimestamp)}</span>
            </div>
            <div className="flex justify-between items-center border-b border-lilac/50 pb-2">
              <span className="text-muted">Cryptographic Sealing Time:</span>
              <span className="mono text-plum">{formatDateTime(sealedDetails.uploadTimestamp)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted">Custody Event:</span>
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium text-[11px]">
                <ShieldCheck className="size-3.5" />
                EVIDENCE_UPLOADED Anchored
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              variant="primary"
              onClick={() => navigate(`/case/${caseId}/evidence`)}
            >
              View in Case Vault
              <ArrowRight className="size-4 ml-1.5" />
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate(`/case/${caseId}/chain-of-custody`)}
            >
              Inspect Chain of Custody
            </Button>
            <Button
              variant="quiet"
              onClick={handleResetWorkflow}
            >
              Ingest Another Item
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default EvidenceCapture;
