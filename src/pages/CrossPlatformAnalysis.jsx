import { useState, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  ChevronRight,
  Download,
  ExternalLink,
  FileDown,
  FileSearch,
  Filter,
  Layers,
  PhoneCall,
  Scale,
  Shield,
  ShieldAlert,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useVera } from '../store/VeraStore';
import { useToast } from '../store/ToastProvider';
import { formatBytes, formatDateTime, hashBlocks } from '../lib/format';
import { correlateCrossPlatformIncidents } from '../services/incidentCorrelationService';
import { analyzeEscalationAndRisk, INDICATOR_SEVERITY } from '../services/riskAnalysisService';
import { RelationshipGraph } from '../components/RelationshipGraph';
import { PatternAnalysis } from '../components/PatternAnalysis';
import { exportDossierPdf, exportEvidenceZip } from '../services/caseStore';
import { cn } from '../lib/cn';
import { isDemoCase } from '../data/demoCaseData';

const getWorkflowSteps = (caseId) => [
  { label: '1. Import Evidence', to: `/case/${caseId}/evidence`, active: false },
  { label: '2. Correlate Incidents', to: '#graph-heading', active: true },
  { label: '3. Analyse Escalation', to: '#risk-heading', active: true },
  { label: '4. Review Findings', to: '#chronology-heading', active: true },
  { label: '5. Export Dossier', to: `/case/${caseId}/dossier`, active: false },
];

export function CrossPlatformAnalysis() {
  const { caseId } = useParams();
  const { getCase, getEvidence, getTimeline } = useVera();
  const toast = useToast();

  const [platformFilter, setPlatformFilter] = useState('ALL');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);

  const record = getCase(caseId);
  const evidence = getEvidence(caseId);
  const timeline = getTimeline(caseId);

  // Run Correlation & Escalation Engines
  const correlationData = useMemo(
    () => correlateCrossPlatformIncidents(evidence, timeline),
    [evidence, timeline],
  );

  const riskAssessment = useMemo(
    () => analyzeEscalationAndRisk(record, evidence, timeline),
    [record, evidence, timeline],
  );

  if (!record) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-20 sm:px-8">
        <EmptyState
          icon={FileSearch}
          title="Case not found"
          action={<Button to="/dashboard" variant="primary">Back to cases</Button>}
        >
          <p>
            The case <span className="mono text-plum">{caseId}</span> is not found in this browser.
          </p>
        </EmptyState>
      </div>
    );
  }

  // Filtered Chronology
  const filteredChronology = useMemo(() => {
    if (platformFilter === 'ALL') return correlationData.chronology;
    return correlationData.chronology.filter(
      (item) => item.platform.id === platformFilter || item.platform.label === platformFilter,
    );
  }, [correlationData.chronology, platformFilter]);

  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      const blob = await exportDossierPdf(caseId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VeraTrace_Dossier_${record.caseId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('Dossier PDF downloaded', { detail: `VeraTrace_Dossier_${record.caseId}.pdf` });
    } catch (err) {
      toast('Failed to generate PDF', { tone: 'error', detail: err.message });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportZip = async () => {
    try {
      setIsExportingZip(true);
      const blob = await exportEvidenceZip(caseId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VeraTrace_EvidenceVault_${record.caseId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('Evidence ZIP downloaded', { detail: `VeraTrace_EvidenceVault_${record.caseId}.zip` });
    } catch (err) {
      toast('Failed to package evidence ZIP', { tone: 'error', detail: err.message });
    } finally {
      setIsExportingZip(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 text-plum">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-6">
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
          <li aria-current="page" className="text-plum font-medium">
            Pattern & Risk Analysis
          </li>
        </ol>
      </nav>

      {(isDemoCase(caseId) || record.isDemo) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <span className="mono font-bold uppercase tracking-wider text-amber-800">Simulated Demo Case</span>
            <span className="text-amber-700/80">·</span>
            <span>All correlation touchpoints, graph nodes, and risk findings are derived from fictional demonstration records.</span>
          </div>
        </div>
      )}

      {/* Case Header & Workflow Banner */}
      <header className="border-b border-lilac pb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="eyebrow">Forensic Intelligence & Threat Assessment</p>
            <h1 className="display-lg mt-2 text-plum">
              Cross-Platform Harassment Pattern Analysis
            </h1>
            <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">
              Correlating multi-channel evidence across platforms, mapping shared accounts and handles,
              and assessing observable indicators of escalation and block bypasses.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleExportPdf} disabled={isExportingPdf}>
              <FileDown className="size-4" aria-hidden="true" />
              {isExportingPdf ? 'Compiling PDF…' : 'Export Dossier PDF'}
            </Button>
            <Button variant="primary" to={`/case/${caseId}/dossier`}>
              Preserve Evidence & Generate Dossier
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Workflow Progression Breadcrumb */}
        <div className="mt-8 flex flex-wrap items-center gap-2 rounded-lg border border-lilac/70 bg-wash/50 px-4 py-3 text-xs">
          <span className="mono font-semibold uppercase tracking-wider text-muted mr-1">Journey:</span>
          {getWorkflowSteps(caseId).map((step, idx, arr) => (
            <div key={step.label} className="flex items-center gap-2">
              {step.to.startsWith('#') ? (
                <a
                  href={step.to}
                  className={cn(
                    'rounded px-2 py-0.5 font-medium transition-colors hover:text-plum hover:bg-paper',
                    step.active
                      ? 'border border-violet-deep/30 bg-paper text-violet-deep shadow-xs font-semibold'
                      : 'text-muted',
                  )}
                >
                  {step.label}
                </a>
              ) : (
                <Link
                  to={step.to}
                  className={cn(
                    'rounded px-2 py-0.5 font-medium transition-colors hover:text-plum hover:bg-paper',
                    step.active
                      ? 'border border-violet-deep/30 bg-paper text-violet-deep shadow-xs font-semibold'
                      : 'text-muted',
                  )}
                >
                  {step.label}
                </Link>
              )}
              {idx < arr.length - 1 && (
                <ArrowRight className="size-3 text-lilac shrink-0" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </header>

      {/* Overview Stat Badges */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-lilac bg-paper p-5 shadow-sheet">
          <p className="mono text-xs uppercase tracking-wider text-muted">Platforms Invaded</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-plum">{correlationData.platformsCount}</p>
          <p className="mt-1 text-xs text-muted">Distinct communication services</p>
        </div>

        <div className="rounded-lg border border-lilac bg-paper p-5 shadow-sheet">
          <p className="mono text-xs uppercase tracking-wider text-muted">Observed Accounts</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-plum">{correlationData.accounts.length}</p>
          <p className="mt-1 text-xs text-muted">Handles, numbers & senders</p>
        </div>

        <div className="rounded-lg border border-lilac bg-paper p-5 shadow-sheet">
          <p className="mono text-xs uppercase tracking-wider text-muted">Shared Clues</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-plum">{correlationData.crossPlatformIdentifiers.length}</p>
          <p className="mt-1 text-xs text-muted">Cross-platform linking handles</p>
        </div>

        <div className="rounded-lg border border-lilac bg-paper p-5 shadow-sheet">
          <p className="mono text-xs uppercase tracking-wider text-muted">Escalation Indicators</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-plum">{riskAssessment.indicatorsCount || 0}</p>
          <p className="mt-1 text-xs text-muted">Observable threat markers</p>
        </div>
      </div>

      {/* SECTION 1: Account & Identifier Relationship Graph */}
      <section className="mt-12" aria-labelledby="graph-heading">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 id="graph-heading" className="display-md text-plum">
              Account & Identifier Relationship Graph
            </h2>
            <p className="text-xs text-muted mt-1">
              Visualizes cross-platform links, shared usernames, phone numbers, and block bypass migrations.
            </p>
          </div>
        </div>

        <RelationshipGraph correlationData={correlationData} />
      </section>

      {/* SECTION 2: Early-Risk & Escalation Analysis */}
      <section className="mt-14" aria-labelledby="risk-heading">
        <div className="flex items-center justify-between border-b border-lilac pb-4 mb-6">
          <div>
            <h2 id="risk-heading" className="display-md text-plum">
              Early-Risk & Escalation Assessment
            </h2>
            <p className="text-xs text-muted mt-1">
              Deterministic, evidence-linked identification of escalating contact frequency, coercion, and boundaries.
            </p>
          </div>
          <span className="mono rounded-full border border-violet/30 bg-wash px-3 py-1 text-xs font-medium text-violet-deep">
            {riskAssessment.status === 'INSUFFICIENT_DATA' ? 'Insufficient Data' : `${riskAssessment.observedIndicators.length} Indicators Found`}
          </span>
        </div>

        {riskAssessment.status === 'INSUFFICIENT_DATA' ? (
          <div className="rounded-lg border border-lilac bg-paper p-8 text-center">
            <Shield className="mx-auto size-8 text-muted" aria-hidden="true" />
            <p className="mt-3 font-serif text-base font-semibold text-plum">Insufficient Records for Pattern Analysis</p>
            <p className="mt-1 max-w-md mx-auto text-xs leading-relaxed text-muted">
              {riskAssessment.summary}
            </p>
            <Button to={`/case/${caseId}/evidence`} variant="primary" className="mt-4">
              Add Evidence Files
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {riskAssessment.observedIndicators.map((indicator) => (
              <div
                key={indicator.id}
                className={cn(
                  'rounded-lg border p-5 shadow-sheet',
                  indicator.severity === INDICATOR_SEVERITY.HIGH
                    ? 'border-red-300 bg-red-50/40 text-plum'
                    : 'border-lilac bg-paper text-plum',
                )}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'mono rounded px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wider',
                          indicator.severity === INDICATOR_SEVERITY.HIGH
                            ? 'bg-red-200 text-red-900'
                            : 'bg-violet-100 text-violet-deep',
                        )}
                      >
                        {indicator.severity} Severity
                      </span>
                      <h3 className="font-serif text-base font-semibold text-plum">{indicator.name}</h3>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted max-w-2xl">{indicator.description}</p>
                  </div>
                  <span className="mono text-xs text-muted shrink-0">
                    {indicator.count} supporting touchpoint{indicator.count === 1 ? '' : 's'}
                  </span>
                </div>

                {/* Supporting Evidence Backlinks */}
                {indicator.supportingEvidence.length > 0 && (
                  <div className="mt-4 border-t border-lilac/60 pt-3">
                    <p className="mono text-[0.625rem] uppercase tracking-wider text-muted mb-2">
                      Verifiable Supporting Evidence & Excerpts:
                    </p>
                    <ul className="space-y-2">
                      {indicator.supportingEvidence.map((sup, sIdx) => (
                        <li
                          key={sIdx}
                          className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 rounded border border-lilac/50 bg-white/70 px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-medium text-plum">{sup.fileName}</span>
                            {sup.platform && (
                              <span className="mono ml-2 text-[0.6875rem] text-muted">
                                ({sup.platform})
                              </span>
                            )}
                            {sup.excerpt && (
                              <p className="mt-0.5 italic text-muted text-[0.6875rem]">{sup.excerpt}</p>
                            )}
                          </div>
                          {sup.timestamp && (
                            <span className="mono text-[0.6875rem] text-muted shrink-0">
                              {formatDateTime(sup.timestamp)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Data Gaps & Transparency */}
        {riskAssessment.dataGaps?.length > 0 && (
          <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50/60 p-5 text-amber-950">
            <h4 className="font-serif text-sm font-semibold flex items-center gap-1.5 text-amber-900">
              <ShieldAlert className="size-4 text-amber-700" aria-hidden="true" />
              Observed Data Gaps & Investigative Uncertainties
            </h4>
            <ul className="mt-2 list-disc list-inside space-y-1 text-xs text-amber-900">
              {riskAssessment.dataGaps.map((gap, gIdx) => (
                <li key={gIdx}>{gap}</li>
              ))}
            </ul>
            <p className="mt-2 text-[0.6875rem] text-amber-800">
              VeraTrace transparently notes missing sender identities and unverified timestamps to preserve forensic integrity in court.
            </p>
          </div>
        )}

        {/* Prominent Next-Step Action Banner after findings */}
        <div className="mt-8 flex flex-col gap-4 rounded-lg border border-violet/40 bg-wash/80 p-6 shadow-sheet sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="mono text-[0.625rem] font-bold uppercase tracking-wider text-violet-deep">Next Recommended Step</span>
            <h3 className="font-serif text-lg font-semibold text-plum mt-1">Preserve Evidence & Generate Dossier</h3>
            <p className="mt-1 text-xs text-muted max-w-xl">
              Include these cross-platform correlation findings in your official evidence dossier PDF, along with Section 63 BSA certificate drafts and IndexedDB binary archives.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
            >
              <FileDown className="size-4" aria-hidden="true" />
              {isExportingPdf ? 'Compiling PDF…' : 'Quick Export PDF'}
            </Button>
            <Button
              to={`/case/${caseId}/dossier`}
              variant="primary"
            >
              Preserve Evidence & Generate Dossier
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </section>

      {/* SECTION 3: Unified Multi-Platform Incident Chronology */}
      <section className="mt-14" aria-labelledby="chronology-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-lilac pb-4 mb-6">
          <div>
            <h2 id="chronology-heading" className="display-md text-plum">
              Unified Cross-Platform Incident Timeline
            </h2>
            <p className="text-xs text-muted mt-1">
              Consolidated chronological event log linking WhatsApp, Instagram, Email, Calls, and evidence files.
            </p>
          </div>

          {/* Platform Filter Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="size-3.5 text-muted mr-1" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setPlatformFilter('ALL')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                platformFilter === 'ALL'
                  ? 'bg-violet-deep text-white'
                  : 'border border-lilac bg-paper text-muted hover:border-violet hover:text-plum',
              )}
            >
              All Channels ({correlationData.chronology.length})
            </button>
            {correlationData.accounts.map((acc) => acc.platform).filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i).map((plat) => (
              <button
                key={plat.id}
                type="button"
                onClick={() => setPlatformFilter(plat.id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  platformFilter === plat.id
                    ? 'bg-violet-deep text-white'
                    : 'border border-lilac bg-paper text-muted hover:border-violet hover:text-plum',
                )}
              >
                {plat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Timeline Table */}
        <div className="overflow-x-auto rounded-lg border border-lilac bg-paper shadow-sheet">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-lilac bg-ivory/80 mono text-[0.6875rem] uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">Platform</th>
                <th scope="col" className="px-4 py-3">Sender / Handle</th>
                <th scope="col" className="px-4 py-3">Incident Summary & Content</th>
                <th scope="col" className="px-4 py-3">Recorded Time</th>
                <th scope="col" className="px-4 py-3">Block Bypass</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-lilac/60">
              {filteredChronology.map((item) => (
                <tr key={item.id} className="hover:bg-wash/30 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium', item.platform.badgeClass)}>
                      <span className={cn('size-1.5 rounded-full', item.platform.dotClass)} />
                      {item.platform.label}
                    </span>
                  </td>
                  <td className="mono px-4 py-3 font-medium text-plum whitespace-nowrap">
                    {item.senderHandle}
                  </td>
                  <td className="px-4 py-3 text-plum max-w-md">
                    <p className="font-medium">{item.title}</p>
                    {item.notes && item.notes !== item.title && (
                      <p className="mt-0.5 text-muted text-[0.6875rem] italic">{item.notes}</p>
                    )}
                    {item.sha256 && (
                      <p className="mono mt-1 text-[0.625rem] text-muted truncate max-w-xs">
                        SHA-256: {hashBlocks(item.sha256).slice(0, 2).join('')}…
                      </p>
                    )}
                  </td>
                  <td className="mono px-4 py-3 text-muted whitespace-nowrap text-[0.6875rem]">
                    {item.timestamp ? formatDateTime(item.timestamp) : (
                      <span className="text-amber-800 italic">Date Uncertain</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {item.blockedPrior ? (
                      <span className="mono rounded-xs border border-red-300 bg-red-50 px-2 py-0.5 text-[0.625rem] font-bold text-red-800">
                        BYPASS DETECTED
                      </span>
                    ) : (
                      <span className="mono text-muted text-[0.625rem]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 4: Recommended Next Steps & Official Reporting */}
      <section className="mt-14" aria-labelledby="reporting-heading">
        <div className="border-b border-lilac pb-4 mb-6">
          <h2 id="reporting-heading" className="display-md text-plum">
            Recommended Protective & Legal Next Steps
          </h2>
          <p className="text-xs text-muted mt-1">
            Actionable guidance based on observed cross-platform evidence and Indian legal standards.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-lilac bg-paper p-5 shadow-sheet flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-violet-deep font-semibold text-sm">
                <Scale className="size-4" aria-hidden="true" />
                <span>National Cybercrime Reporting</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Submit your authenticated VeraTrace evidence bundle directly to Indian police cyber cells through the official portal.
              </p>
            </div>
            <a
              href="https://cybercrime.gov.in/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex min-h-11 items-center justify-between rounded-md border border-lilac bg-wash px-3 text-xs font-medium text-plum transition-colors hover:border-violet hover:bg-wash/80"
            >
              cybercrime.gov.in
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </div>

          <div className="rounded-lg border border-lilac bg-paper p-5 shadow-sheet flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-violet-deep font-semibold text-sm">
                <PhoneCall className="size-4" aria-hidden="true" />
                <span>National Helpline 1930</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Dial 1930 for immediate telephonic guidance regarding ongoing cyberstalking, online blackmail, or financial extortion.
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-md border border-lilac bg-ivory px-3 py-2.5 text-xs mono font-bold text-violet-deep">
              <span>Helpline: 1930</span>
              <span className="text-[0.625rem] text-muted font-normal">Toll-free 24x7</span>
            </div>
          </div>

          <div className="rounded-lg border border-lilac bg-paper p-5 shadow-sheet flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-violet-deep font-semibold text-sm">
                <FileDown className="size-4" aria-hidden="true" />
                <span>Export Formal Dossier & ZIP</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Download the complete forensic dossier PDF with SHA-256 integrity register and the Section 63 BSA certificate draft.
              </p>
            </div>
            <Button to={`/case/${caseId}/dossier`} variant="primary" className="mt-4 w-full justify-center">
              Preserve Evidence & Generate Dossier
            </Button>
          </div>
        </div>
      </section>

      {/* Ethical & Legal Disclaimer Footer */}
      <footer className="mt-14 border-t border-lilac pt-6 text-[0.6875rem] text-muted leading-relaxed">
        <p>
          <strong>Forensic Integrity Notice:</strong> VeraTrace cross-platform analysis organizes observable facts from user-supplied records.
          It does not deploy continuous surveillance bots, bypass account privacy, scrape private profiles, or predict future violent behavior.
          Shared handles, phone numbers, and phrases indicate correlation rather than guaranteed single-author identity.
        </p>
      </footer>
    </div>
  );
}

export default CrossPlatformAnalysis;
