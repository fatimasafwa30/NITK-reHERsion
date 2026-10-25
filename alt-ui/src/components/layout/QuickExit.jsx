import React, { useEffect, useCallback } from 'react';
import { LogOut } from 'lucide-react';

const SAFE_DESTINATION = 'https://www.google.com';

export default function QuickExit({ className = '' }) {
  const triggerExit = useCallback(() => {
    window.location.replace(SAFE_DESTINATION);
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        triggerExit();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [triggerExit]);

  return (
    <button
      type="button"
      onClick={triggerExit}
      title="Exit immediately (or press Escape)"
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[#D5D0C6] bg-surface text-ink hover:bg-[#F2EFE9] active:bg-[#E7E3DB] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-h-[36px] cursor-pointer ${className}`}
      aria-label="Quick exit this site. You can also press Escape at any time."
    >
      <LogOut className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
      <span>Quick exit</span>
      <kbd className="hidden sm:inline-block ml-1 px-1 py-0.5 text-[10px] font-sans text-muted bg-[#F2EFE9] border border-border rounded">
        Esc
      </kbd>
    </button>
  );
}
