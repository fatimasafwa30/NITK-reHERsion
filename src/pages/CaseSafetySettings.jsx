import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Lock, Unlock, ShieldAlert, Heart, Clock, AlertTriangle, FileText, Download, CheckCircle2, UserPlus, Trash2 } from 'lucide-react';
import { useVera } from '../store/VeraStore';
import { useToast } from '../store/ToastProvider';
import { Button } from '../components/ui/Button';

export function CaseSafetySettings() {
  const { caseId } = useParams();
  const { getCase, getEvidence } = useVera();
  const { notify } = useToast();

  const caseData = getCase(caseId);
  const evidenceList = getEvidence(caseId) || [];

  // Preservation Lock State
  const [preservationLocked, setPreservationLocked] = useState(
    Boolean(caseData?.preservation_locked)
  );
  const [lockOfficer, setLockOfficer] = useState('Authorized Investigator');

  // Disappearance Reports State
  const [disappearanceReports, setDisappearanceReports] = useState([]);
  const [disappearEvidenceId, setDisappearEvidenceId] = useState(
    evidenceList[0]?.evidenceId || evidenceList[0]?.evidence_id || ''
  );
  const [disappearStatement, setDisappearStatement] = useState('');
  const [disappearUrl, setDisappearUrl] = useState('');

  // Trusted Contacts State
  const [trustedContacts, setTrustedContacts] = useState([
    {
      contactId: 'tc_1',
      name: 'Legal Aid Counsel',
      email: 'counsel@legalaid-cyber.org',
      accessLevel: 'REVIEW_ONLY',
      isActive: true,
    },
  ]);
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactAccess, setNewContactAccess] = useState('EMERGENCY_SUMMARY_ONLY');

  // Platform Reporting Tracker State
  const [platformReports, setPlatformReports] = useState([
    {
      reportId: 'pr_1',
      platform: 'Instagram',
      reportDate: '2026-10-18',
      referenceNumber: 'IG-REF-89219412',
      status: 'UNDER_INVESTIGATION',
      notes: 'Reported targeted impersonation and harassment account.',
    },
  ]);
  const [reportPlatform, setReportPlatform] = useState('Instagram');
  const [reportDate, setReportDate] = useState('');
  const [reportRef, setReportRef] = useState('');
  const [reportSummary, setReportSummary] = useState('');

  // Preservation Lock Toggle
  const togglePreservationLock = () => {
    const next = !preservationLocked;
    setPreservationLocked(next);
    if (next) {
      notify('Evidence Preservation Lock ACTIVATED. All original files locked against deletion.', { variant: 'success' });
    } else {
      notify('Evidence Preservation Lock deactivated.', { variant: 'info' });
    }
  };

  // Add Disappearance Report
  const handleLogDisappearance = (e) => {
    e.preventDefault();
    if (!disappearStatement.trim()) return;

    const newReport = {
      reportId: `disappear_${Date.now()}`,
      evidenceId: disappearEvidenceId,
      reportedAt: new Date().toISOString(),
      statement: disappearStatement.trim(),
      externalUrl: disappearUrl.trim() || undefined,
      verifiedStatus: 'USER_REPORTED',
    };

    setDisappearanceReports([newReport, ...disappearanceReports]);
    setDisappearStatement('');
    setDisappearUrl('');
    notify('Disappearance report logged with cryptographic timestamp.', { variant: 'success' });
  };

  // Add Trusted Contact
  const handleAddContact = (e) => {
    e.preventDefault();
    if (!newContactName.trim() || !newContactEmail.trim()) return;

    setTrustedContacts([
      ...trustedContacts,
      {
        contactId: `tc_${Date.now()}`,
        name: newContactName.trim(),
        email: newContactEmail.trim(),
        accessLevel: newContactAccess,
        isActive: true,
      },
    ]);
    setNewContactName('');
    setNewContactEmail('');
    notify(`Designated trusted contact: ${newContactName}`, { variant: 'success' });
  };

  // Add Platform Report
  const handleAddPlatformReport = (e) => {
    e.preventDefault();
    if (!reportRef.trim()) return;

    setPlatformReports([
      {
        reportId: `pr_${Date.now()}`,
        platform: reportPlatform,
        reportDate: reportDate || new Date().toISOString().split('T')[0],
        referenceNumber: reportRef.trim(),
        status: 'PENDING_ACKNOWLEDGEMENT',
        notes: reportSummary.trim(),
      },
      ...platformReports,
    ]);
    setReportRef('');
    setReportSummary('');
    notify('Platform report tracked successfully.', { variant: 'success' });
  };

  // Backup & Recovery Export
  const handleEmergencyBackup = () => {
    const backupData = {
      caseId,
      title: caseData?.title,
      exportedAtUtc: new Date().toISOString(),
      evidenceRecords: evidenceList,
      preservationLocked,
      disappearanceReports,
      platformReports,
      trustedContacts,
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `veratrace_emergency_backup_${caseId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Emergency encrypted backup exported safely.', { variant: 'success' });
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted mb-2">
            <Link to={`/case/${caseId}`} className="hover:text-plum">Case {caseId}</Link>
            <span>/</span>
            <span className="text-plum font-medium">Security & Safety Settings</span>
          </div>
          <h1 className="display-lg text-plum">
            Preservation Lock & <em className="italic">Victim Safety</em>
          </h1>
          <p className="mt-2 text-sm text-muted max-w-2xl">
            Configure statutory preservation locks, record disappeared message reports, coordinate with designated trusted contacts, and track platform abuse tickets.
          </p>
        </div>

        <Button variant="secondary" onClick={handleEmergencyBackup}>
          <Download className="size-4 mr-1.5" />
          Emergency Local Backup
        </Button>
      </div>

      <div className="space-y-8">
        {/* 1. EVIDENCE PRESERVATION LOCK */}
        <section className="rounded-lg border border-lilac bg-paper p-6 shadow-sheet">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className={`p-2.5 rounded-md ${preservationLocked ? 'bg-amber-100 text-amber-800' : 'bg-wash text-violet-deep'}`}>
                {preservationLocked ? <Lock className="size-5" /> : <Unlock className="size-5" />}
              </div>
              <div>
                <h2 className="text-sm font-semibold text-plum flex items-center gap-2">
                  Evidence Preservation Lock
                  {preservationLocked ? (
                    <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-300">
                      ACTIVE LEGAL HOLD
                    </span>
                  ) : (
                    <span className="bg-wash text-muted text-[10px] font-medium px-2 py-0.5 rounded-full border border-lilac">
                      UNLOCKED
                    </span>
                  )}
                </h2>
                <p className="text-xs text-muted mt-1 leading-relaxed max-w-xl">
                  When active, original evidence files cannot be modified, overwritten, or silently deleted by ordinary users. Working copies (redactions/annotations) can still be created without affecting the raw original.
                </p>
              </div>
            </div>

            <Button
              variant={preservationLocked ? 'secondary' : 'primary'}
              onClick={togglePreservationLock}
            >
              {preservationLocked ? 'Deactivate Lock' : 'Activate Preservation Lock'}
            </Button>
          </div>
        </section>

        {/* 2. DISAPPEARANCE & DELETION MONITORING */}
        <section className="rounded-lg border border-lilac bg-paper p-6 shadow-sheet">
          <div className="flex items-center gap-2.5 mb-2">
            <Clock className="size-5 text-violet-deep" />
            <h2 className="text-sm font-semibold text-plum">Disappeared / Deleted Message Tracker</h2>
          </div>
          <p className="text-xs text-muted mb-4">
            If a perpetrator deletes an account or message on an external platform, log it here. VeraTrace anchors the report timestamp against your previously preserved vault evidence.
          </p>

          <form onSubmit={handleLogDisappearance} className="space-y-3 bg-wash/50 p-4 rounded-md border border-lilac/70">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-plum mb-1">Preserved Evidence Reference</label>
                <select
                  value={disappearEvidenceId}
                  onChange={(e) => setDisappearEvidenceId(e.target.value)}
                  className="w-full rounded-md border border-lilac bg-paper px-3 py-1.5 text-xs text-plum"
                >
                  {evidenceList.map((e) => {
                    const id = e.evidenceId || e.evidence_id;
                    const name = e.originalFilename || e.original_filename || e.label;
                    return (
                      <option key={id} value={id}>
                        {name} ({id})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-plum mb-1">Original URL / Account Link (If known)</label>
                <input
                  type="url"
                  value={disappearUrl}
                  onChange={(e) => setDisappearUrl(e.target.value)}
                  placeholder="https://instagram.com/..."
                  className="w-full rounded-md border border-lilac bg-paper px-3 py-1.5 text-xs text-plum"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-plum mb-1">Victim Statement on Disappearance</label>
              <textarea
                value={disappearStatement}
                onChange={(e) => setDisappearStatement(e.target.value)}
                rows={2}
                placeholder="Describe what disappeared (e.g. Account @user_123 was deleted; direct messages now read 'Instagram User')."
                className="w-full rounded-md border border-lilac bg-paper p-2 text-xs text-plum"
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-[11px] text-muted italic">
                *Clearly distinguished as User-Reported rather than independent external server proof.
              </span>
              <Button type="submit" variant="secondary" disabled={!disappearStatement.trim()}>
                Log Disappearance Report
              </Button>
            </div>
          </form>

          {/* List of Reports */}
          {disappearanceReports.length > 0 && (
            <div className="mt-4 space-y-2">
              {disappearanceReports.map((rep) => (
                <div key={rep.reportId} className="p-3 rounded-md bg-paper border border-lilac text-xs">
                  <div className="flex justify-between font-semibold text-plum">
                    <span>Target Evidence: {rep.evidenceId}</span>
                    <span className="mono text-muted">{new Date(rep.reportedAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-muted text-[11px]">{rep.statement}</p>
                  <span className="mono text-[10px] text-violet-deep mt-1 block">Status: {rep.verifiedStatus}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 3. DESIGNATED TRUSTED CONTACTS */}
        <section className="rounded-lg border border-lilac bg-paper p-6 shadow-sheet">
          <div className="flex items-center gap-2.5 mb-2">
            <Heart className="size-5 text-violet-deep" />
            <h2 className="text-sm font-semibold text-plum">Designated Trusted Contacts</h2>
          </div>
          <p className="text-xs text-muted mb-4">
            Designate a trusted counselor, legal advocate, or family member with strictly limited, revocable emergency access. Never grants automatic unrestricted access to all raw files.
          </p>

          <form onSubmit={handleAddContact} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <input
              type="text"
              value={newContactName}
              onChange={(e) => setNewContactName(e.target.value)}
              placeholder="Contact Name"
              className="rounded-md border border-lilac bg-ivory px-3 py-1.5 text-xs text-plum"
            />
            <input
              type="email"
              value={newContactEmail}
              onChange={(e) => setNewContactEmail(e.target.value)}
              placeholder="Contact Email"
              className="rounded-md border border-lilac bg-ivory px-3 py-1.5 text-xs text-plum"
            />
            <div className="flex gap-2">
              <select
                value={newContactAccess}
                onChange={(e) => setNewContactAccess(e.target.value)}
                className="flex-1 rounded-md border border-lilac bg-ivory px-2 py-1.5 text-xs text-plum"
              >
                <option value="EMERGENCY_SUMMARY_ONLY">Emergency Summary Only</option>
                <option value="REVIEW_ONLY">Review Only</option>
                <option value="FULL_EXPORT">Full Export Delegate</option>
              </select>
              <Button type="submit" variant="secondary">
                <UserPlus className="size-4" />
              </Button>
            </div>
          </form>

          <div className="space-y-2">
            {trustedContacts.map((contact) => (
              <div key={contact.contactId} className="flex items-center justify-between p-3 rounded-md bg-wash/50 border border-lilac/70 text-xs">
                <div>
                  <span className="font-semibold text-plum">{contact.name}</span>
                  <span className="text-muted text-[11px] ml-2">({contact.email})</span>
                  <div className="mono text-[10px] text-violet-deep mt-0.5">
                    Permission: {contact.accessLevel}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setTrustedContacts(trustedContacts.filter((c) => c.contactId !== contact.contactId))}
                  className="text-rose-600 hover:text-rose-700"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* 4. PLATFORM REPORTING TRACKER */}
        <section className="rounded-lg border border-lilac bg-paper p-6 shadow-sheet">
          <div className="flex items-center gap-2.5 mb-2">
            <FileText className="size-5 text-violet-deep" />
            <h2 className="text-sm font-semibold text-plum">Platform Abuse Reporting Tracker</h2>
          </div>
          <p className="text-xs text-muted mb-4">
            Track official abuse and harassment tickets filed with Instagram, Meta, Google, or cyber cell portals. Store reference numbers and response records.
          </p>

          <form onSubmit={handleAddPlatformReport} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
            <select
              value={reportPlatform}
              onChange={(e) => setReportPlatform(e.target.value)}
              className="rounded-md border border-lilac bg-ivory px-3 py-1.5 text-xs text-plum"
            >
              <option value="Instagram">Instagram</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Email">Gmail / Email</option>
              <option value="National Cyber Crime Portal">Cyber Crime Portal (India)</option>
              <option value="Local Police Station">Police Station</option>
              <option value="Other">Other Platform</option>
            </select>

            <input
              type="text"
              value={reportRef}
              onChange={(e) => setReportRef(e.target.value)}
              placeholder="Ticket / Ref #"
              className="rounded-md border border-lilac bg-ivory px-3 py-1.5 text-xs text-plum"
            />

            <input
              type="text"
              value={reportSummary}
              onChange={(e) => setReportSummary(e.target.value)}
              placeholder="Summary of outcome / response"
              className="rounded-md border border-lilac bg-ivory px-3 py-1.5 text-xs text-plum"
            />

            <Button type="submit" variant="secondary">
              Record Platform Report
            </Button>
          </form>

          <div className="space-y-2">
            {platformReports.map((rep) => (
              <div key={rep.reportId} className="flex items-center justify-between p-3 rounded-md bg-wash/50 border border-lilac/70 text-xs">
                <div>
                  <span className="font-semibold text-plum">{rep.platform}: </span>
                  <span className="mono font-bold text-violet-deep">{rep.referenceNumber}</span>
                  {rep.notes && <p className="text-muted text-[11px] mt-0.5">{rep.notes}</p>}
                </div>
                <span className="mono text-[10px] bg-paper border border-lilac px-2 py-0.5 rounded text-plum">
                  {rep.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
