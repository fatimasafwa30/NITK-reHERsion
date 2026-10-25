import { useMemo } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Clock,
  Layers,
  Moon,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react';
import { analyzeHarassmentPattern } from '../services/patternAnalysisService';
import { cn } from '../lib/cn';
import { formatDateTime } from '../lib/format';

export function PatternAnalysis({ caseRecord, evidence = [], timeline = [], className }) {
  const analysis = useMemo(
    () => analyzeHarassmentPattern(caseRecord, evidence, timeline),
    [caseRecord, evidence, timeline],
  );

  if (!evidence.length && !timeline.length) {
    return (
      <div className={cn('rounded-lg border border-lilac bg-paper p-6 text-plum', className)}>
        <div className="flex items-center gap-2.5 text-plum">
          <Activity className="size-5 text-violet-deep" aria-hidden="true" />
          <h3 className="font-serif text-lg font-semibold">Cross-Platform Pattern Analysis</h3>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Add evidence files or timeline events to automatically map cross-platform harassment patterns,
          communication channel shifts, and temporal velocity.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border border-lilac bg-paper p-6 shadow-sheet text-plum', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-lilac pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="size-5 text-violet-deep" aria-hidden="true" />
            <h3 className="font-serif text-lg font-semibold text-plum">
              Cross-Platform Harassment Pattern Analysis
            </h3>
          </div>
          <p className="mono mt-1 text-[0.6875rem] text-muted">
            Chronological multi-channel correlation across {analysis.distinctPlatformCount}{' '}
            {analysis.distinctPlatformCount === 1 ? 'platform' : 'platforms'} ·{' '}
            {analysis.totalTouchpoints} total touchpoints
          </p>
        </div>
        {analysis.isMultiPlatform && (
          <span className="mono inline-flex items-center gap-1.5 self-start rounded-full border border-violet/40 bg-wash px-3 py-1 text-xs font-medium text-violet-deep sm:self-auto">
            <Zap className="size-3.5" aria-hidden="true" />
            Multi-Platform Footprint
          </span>
        )}
      </div>

      {/* Metric Cards Grid */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-lilac/70 bg-ivory/60 p-3">
          <div className="flex items-center justify-between text-muted">
            <span className="mono text-[0.625rem] uppercase tracking-wider">Platforms</span>
            <Layers className="size-3.5" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xl font-semibold text-plum">{analysis.distinctPlatformCount}</p>
          <p className="mt-0.5 text-[0.625rem] text-muted">Distinct channels</p>
        </div>

        <div className="rounded-md border border-lilac/70 bg-ivory/60 p-3">
          <div className="flex items-center justify-between text-muted">
            <span className="mono text-[0.625rem] uppercase tracking-wider">Time Span</span>
            <Clock className="size-3.5" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xl font-semibold text-plum">
            {analysis.timespanDays ? `${analysis.timespanDays}d` : '1d'}
          </p>
          <p className="mt-0.5 text-[0.625rem] text-muted">Recorded duration</p>
        </div>

        <div className="rounded-md border border-lilac/70 bg-ivory/60 p-3">
          <div className="flex items-center justify-between text-muted">
            <span className="mono text-[0.625rem] uppercase tracking-wider">Off-Hours</span>
            <Moon className="size-3.5" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xl font-semibold text-plum">{analysis.offHoursCount}</p>
          <p className="mt-0.5 text-[0.625rem] text-muted">10 PM – 6 AM contact</p>
        </div>

        <div className="rounded-md border border-lilac/70 bg-ivory/60 p-3">
          <div className="flex items-center justify-between text-muted">
            <span className="mono text-[0.625rem] uppercase tracking-wider">Velocity</span>
            <Sparkles className="size-3.5" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xl font-semibold text-plum">
            {analysis.burstDetected ? 'Burst' : 'Steady'}
          </p>
          <p className="mt-0.5 text-[0.625rem] text-muted">Incident clustering</p>
        </div>
      </div>

      {/* Platform Breakdown Badges */}
      <div className="mt-6">
        <p className="eyebrow mb-2">Detected Channels & Touchpoint Counts</p>
        <div className="flex flex-wrap gap-2">
          {analysis.detectedPlatforms.map(({ platform, count }) => (
            <span
              key={platform.id}
              className={cn(
                'inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium',
                platform.badgeClass,
              )}
            >
              <span className={cn('size-1.5 rounded-full', platform.dotClass)} />
              {platform.label}
              <span className="mono rounded bg-white/70 px-1.5 py-0.2 text-[0.625rem] font-bold">
                {count}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Escalation Trajectory (Cross-Channel Hops) */}
      {analysis.escalationHops.length >= 2 && (
        <div className="mt-6 rounded-md border border-lilac/70 bg-wash/40 p-4">
          <p className="eyebrow mb-2">Cross-Channel Transition Trajectory</p>
          <div className="flex flex-wrap items-center gap-2">
            {analysis.escalationHops.map((hop, index) => (
              <div key={`${hop.platform.id}-${index}`} className="flex items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium',
                    hop.platform.badgeClass,
                  )}
                  title={`${hop.label} (${formatDateTime(hop.occurredAt)})`}
                >
                  {hop.platform.label}
                </span>
                {index < analysis.escalationHops.length - 1 && (
                  <ArrowRight className="size-3.5 text-lilac shrink-0" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Chronological progression demonstrates communication channel migration across platform boundaries.
          </p>
        </div>
      )}

      {/* Structured Factual Findings */}
      {analysis.findings.length > 0 && (
        <div className="mt-6 space-y-2.5">
          <p className="eyebrow">Structured Factual Findings</p>
          <div className="space-y-2">
            {analysis.findings.map((finding, idx) => (
              <div
                key={idx}
                className={cn(
                  'rounded-md border p-3 text-xs leading-relaxed',
                  finding.highlight
                    ? 'border-violet/30 bg-wash/60 text-plum'
                    : 'border-lilac/60 bg-paper text-muted',
                )}
              >
                <p className="font-semibold text-plum">{finding.title}</p>
                <p className="mt-1 text-muted">{finding.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Forensic Disclaimer */}
      <div className="mt-6 flex items-start gap-2 border-t border-lilac/70 pt-4 text-[0.6875rem] text-muted">
        <Shield className="size-4 shrink-0 text-violet-deep mt-0.5" aria-hidden="true" />
        <p className="leading-normal">{analysis.disclaimer}</p>
      </div>
    </div>
  );
}

export default PatternAnalysis;
