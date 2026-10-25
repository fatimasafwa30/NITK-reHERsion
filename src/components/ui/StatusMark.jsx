import { Circle, CircleCheck, CircleDashed, CircleDotDashed, TriangleAlert } from 'lucide-react';
import { cn } from '../../lib/cn';
import { SealMark } from '../SealMark';
import { CASE_STATUS_LABEL, VERIFICATION_LABEL } from '../../lib/format';

/**
 * Status is never carried by colour alone: every mark is an icon plus a word.
 */

const VERIFICATION = {
  MATCH: { tone: 'violet', seal: true },
  UNVERIFIED: { tone: 'muted', Icon: CircleDashed },
  MISMATCH: { tone: 'alert', Icon: TriangleAlert },
  ERROR: { tone: 'alert', Icon: TriangleAlert },
};

const TONES = {
  violet: 'text-violet-deep',
  muted: 'text-muted',
  alert: 'text-alert',
};

export function VerificationMark({ status = 'UNVERIFIED', drawIn = false, className, size = 16 }) {
  const spec = VERIFICATION[status] || VERIFICATION.UNVERIFIED;
  const label = VERIFICATION_LABEL[status] || VERIFICATION_LABEL.UNVERIFIED;

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[0.8125rem] font-medium', TONES[spec.tone], className)}>
      {spec.seal ? (
        <SealMark size={size + 4} drawIn={drawIn} />
      ) : (
        <spec.Icon aria-hidden="true" strokeWidth={1.5} style={{ width: size, height: size }} />
      )}
      {label}
    </span>
  );
}

const CASE_ICON = {
  OPEN: Circle,
  IN_PROGRESS: CircleDotDashed,
  CLOSED: CircleCheck,
};

export function CaseStatusMark({ status = 'OPEN', className }) {
  const Icon = CASE_ICON[status] || Circle;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[0.8125rem]',
        status === 'CLOSED' ? 'text-muted' : 'text-plum',
        className,
      )}
    >
      <Icon aria-hidden="true" strokeWidth={1.5} className="size-[14px] text-violet-deep" />
      {CASE_STATUS_LABEL[status] || status}
    </span>
  );
}
