import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Globe, Shield, UploadCloud, FileCheck, AlertCircle, ArrowRight, ExternalLink } from 'lucide-react';
import { useVera } from '../store/VeraStore';
import { useToast } from '../store/ToastProvider';
import { Button } from '../components/ui/Button';
import { Dropzone } from '../components/Dropzone';
import { sha256File } from '../lib/hash';

export function EvidenceCapture() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const { getCase, addEvidence } = useVera();
  const { notify } = useToast();

  const caseData = getCase(caseId);
  const [platform, setPlatform] = useState('Instagram');
  const [senderHandle, setSenderHandle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [captureTimestamp, setCaptureTimestamp] = useState('');
  const [notes, setContextNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [computedHash, setComputedHash] = useState('');
  const [sealing, setSealing] = useState(false);

  const handleFileSelect = async (file) => {
    setSelectedFile(file);
    try {
      const hash = await sha256File(file);
      setComputedHash(hash);
    } catch {
      setComputedHash('Calculated upon sealing');
    }
  };

  const handleManualIngest = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      notify('Please select or drop an evidence file to seal.', { variant: 'error' });
      return;
    }

    setSealing(true);
    try {
      await addEvidence(caseId, {
        originalFilename: selectedFile.name,
        fileType: selectedFile.type || 'image/png',
        fileSize: selectedFile.size,
        sourceUrl: sourceUrl.trim() || undefined,
        captureTimestamp: captureTimestamp || undefined,
        senderHandle: senderHandle.trim() || undefined,
        platform,
        notes: notes.trim() || undefined,
        submissionSource: 'USER_SUBMITTED',
        submissionMethod: 'MANUAL_DROPZONE',
      }, selectedFile);

      notify('Evidence file sealed in secure vault with SHA-256 fingerprint.', { variant: 'success' });
      navigate(`/case/${caseId}/evidence`);
    } catch (err) {
      notify(`Ingestion failed: ${err.message}`, { variant: 'error' });
    } finally {
      setSealing(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs text-muted mb-2">
          <Link to={`/case/${caseId}`} className="hover:text-plum">Case {caseId}</Link>
          <span>/</span>
          <span className="text-plum font-medium">Evidence Capture</span>
        </div>
        <h1 className="display-lg text-plum">
          Capture & Preserve <em className="italic">Digital Evidence</em>
        </h1>
        <p className="mt-2 text-sm text-muted max-w-2xl">
          Collect evidence without altering original files. Every intake receives an instant SHA-256 fingerprint, separate working copy storage, and append-only chain of custody registration.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Chrome Extension Integration */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-lg border border-lilac bg-paper p-6 shadow-sheet">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex size-10 items-center justify-center rounded-md bg-wash text-violet-deep border border-lilac">
                <Globe className="size-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-plum">VeraTrace Chrome Extension</h2>
                <span className="mono text-[10px] text-violet-deep font-medium bg-wash px-2 py-0.5 rounded-full border border-lilac">
                  Manifest V3 · Ingestion Companion
                </span>
              </div>
            </div>

            <p className="text-xs text-muted leading-relaxed mb-4">
              Eliminate manual screenshotting burden. The official companion captures visible tab content, extracts page URLs, and timestamps evidence directly into this case.
            </p>

            <div className="space-y-3 rounded-md bg-wash/60 border border-lilac/60 p-3 text-xs">
              <div className="flex items-start gap-2">
                <Shield className="size-4 text-violet-deep shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-plum">Epistemic Safety:</span>
                  <p className="text-muted text-[11px] mt-0.5">
                    Requests only <code>activeTab</code> permissions upon explicit capture. Does not access private accounts or scrape restricted data.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-lilac/60 flex flex-col gap-2">
              <div className="text-[11px] text-muted font-medium">How to Load Extension:</div>
              <ol className="text-[11px] text-muted space-y-1.5 list-decimal pl-4">
                <li>Open <code>chrome://extensions</code> in Chrome or Edge</li>
                <li>Enable <strong>Developer mode</strong> (top-right switch)</li>
                <li>Click <strong>Load unpacked</strong> and select the <code>extension/</code> folder</li>
              </ol>
            </div>
          </div>

          <div className="rounded-lg border border-lilac bg-wash/40 p-5">
            <h3 className="text-xs font-semibold text-plum flex items-center gap-1.5">
              <AlertCircle className="size-4 text-violet-deep" />
              Capture vs Upload Timestamp
            </h3>
            <p className="mt-2 text-xs text-muted leading-relaxed">
              VeraTrace strictly records both:
              <br />
              <strong>Capture Timestamp:</strong> When the screenshot or message actually occurred.
              <br />
              <strong>Upload Timestamp:</strong> When VeraTrace computed the cryptographic fingerprint.
            </p>
          </div>
        </div>

        {/* Right Column: Web Upload & Ingestion */}
        <div className="lg:col-span-7">
          <form onSubmit={handleManualIngest} className="rounded-lg border border-lilac bg-paper p-6 shadow-sheet">
            <h2 className="text-sm font-semibold text-plum mb-1">Manual Evidence Ingestion</h2>
            <p className="text-xs text-muted mb-5">
              Upload original screenshots, video recordings, exported chat archives, or audio notes.
            </p>

            <Dropzone
              onFileSelect={handleFileSelect}
              accept="image/*,video/*,audio/*,application/pdf,text/plain"
            />

            {selectedFile && (
              <div className="mt-4 p-3 rounded-md bg-wash border border-lilac text-xs">
                <div className="flex items-center justify-between font-semibold text-plum">
                  <span>{selectedFile.name}</span>
                  <span className="mono text-muted">{(selectedFile.size / 1024).toFixed(1)} KB</span>
                </div>
                {computedHash && (
                  <div className="mt-1.5 mono text-[10px] text-violet-deep break-all">
                    SHA-256: {computedHash}
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-plum mb-1">Platform Channel</label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="w-full rounded-md border border-lilac bg-ivory px-3 py-2 text-xs text-plum outline-none focus:border-violet-deep"
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

              <div>
                <label className="block text-xs font-medium text-plum mb-1">Sender Handle / Identifier</label>
                <input
                  type="text"
                  value={senderHandle}
                  onChange={(e) => setSenderHandle(e.target.value)}
                  placeholder="@username or phone number"
                  className="w-full rounded-md border border-lilac bg-ivory px-3 py-2 text-xs text-plum outline-none focus:border-violet-deep"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-plum mb-1">Source URL (Optional)</label>
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-md border border-lilac bg-ivory px-3 py-2 text-xs text-plum outline-none focus:border-violet-deep"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-plum mb-1">Incident Capture Time (Optional)</label>
                <input
                  type="datetime-local"
                  value={captureTimestamp}
                  onChange={(e) => setCaptureTimestamp(e.target.value)}
                  className="w-full rounded-md border border-lilac bg-ivory px-3 py-2 text-xs text-plum outline-none focus:border-violet-deep"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-plum mb-1">Contextual Incident Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setContextNotes(e.target.value)}
                rows={3}
                placeholder="Describe what occurred (e.g. Unwanted contact received immediately following an explicit block on another platform)."
                className="w-full rounded-md border border-lilac bg-ivory px-3 py-2 text-xs text-plum outline-none focus:border-violet-deep"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-lilac">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(`/case/${caseId}`)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={sealing || !selectedFile}
              >
                <UploadCloud className="size-4 mr-1.5" />
                {sealing ? 'Computing SHA-256 & Sealing...' : 'Seal in Vault'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
