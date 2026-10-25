import React from 'react';
import { CheckCircle2, AlertCircle, HelpCircle, Clock, ShieldCheck, Folder, FolderCheck } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function Badge({
  status,
  variant,
  label,
  icon,
  className = '',
}) {
  // Normalize status if provided
  let text = label;
  let IconComponent = icon;
  let colorStyles = 'bg-surface text-ink border-border';

  const s = (status || '').toUpperCase();

  if (s === 'MATCH' || s === 'VERIFIED') {
    text = text || 'Verified';
    IconComponent = IconComponent || CheckCircle2;
    colorStyles = 'bg-[#F0F7F3] text-verified border-[#C4E3D2]';
  } else if (s === 'UNVERIFIED') {
    text = text || 'Unverified';
    IconComponent = IconComponent || HelpCircle;
    colorStyles = 'bg-[#FBF7EB] text-unverified border-[#EBDDAF]';
  } else if (s === 'MISMATCH' || s === 'ERROR') {
    text = text || 'Hash Mismatch';
    IconComponent = IconComponent || AlertCircle;
    colorStyles = 'bg-[#FDF2F1] text-mismatch border-[#F4C7C3]';
  } else if (s === 'OPEN') {
    text = text || 'Open';
    IconComponent = IconComponent || Folder;
    colorStyles = 'bg-accent-soft text-accent border-[#C2DCD8]';
  } else if (s === 'IN_PROGRESS') {
    text = text || 'In progress';
    IconComponent = IconComponent || Clock;
    colorStyles = 'bg-[#F5F2EC] text-ink border-border';
  } else if (s === 'CLOSED') {
    text = text || 'Closed';
    IconComponent = IconComponent || FolderCheck;
    colorStyles = 'bg-[#EAE7DF] text-muted border-border';
  } else if (status === 'uncertain') {
    text = text || 'Uncertain date';
    IconComponent = IconComponent || Clock;
    colorStyles = 'bg-[#FBF7EB] text-unverified border-[#EBDDAF]';
  } else if (status === 'confirmed') {
    text = text || 'Confirmed time';
    IconComponent = IconComponent || ShieldCheck;
    colorStyles = 'bg-[#F0F7F3] text-verified border-[#C4E3D2]';
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border leading-none',
        colorStyles,
        className
      )}
    >
      {IconComponent && <IconComponent className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
      <span>{text}</span>
    </span>
  );
}
