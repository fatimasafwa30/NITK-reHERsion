import React from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { LayoutDashboard, FileText, Layers, Archive } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function MobileTabBar() {
  const location = useLocation();
  const { caseId } = useParams();
  const path = location.pathname;

  // Only show on app pages, not on home landing
  if (path === '/') return null;

  return (
    <nav
      className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md border-t border-border no-print pb-safe"
      aria-label="Mobile Navigation"
    >
      <div className="flex items-center justify-around h-14">
        <Link
          to="/dashboard"
          className={cn(
            'flex flex-col items-center justify-center flex-1 h-full py-1 text-[11px] font-medium transition-colors',
            path === '/dashboard' ? 'text-accent' : 'text-muted'
          )}
        >
          <LayoutDashboard className="w-5 h-5 mb-0.5" aria-hidden="true" />
          <span>Cases</span>
        </Link>

        {caseId ? (
          <>
            <Link
              to={`/case/${caseId}`}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full py-1 text-[11px] font-medium transition-colors',
                path === `/case/${caseId}` ? 'text-accent' : 'text-muted'
              )}
            >
              <FileText className="w-5 h-5 mb-0.5" aria-hidden="true" />
              <span>Overview</span>
            </Link>

            <Link
              to={`/case/${caseId}/evidence`}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full py-1 text-[11px] font-medium transition-colors',
                path.includes('/evidence') ? 'text-accent' : 'text-muted'
              )}
            >
              <Layers className="w-5 h-5 mb-0.5" aria-hidden="true" />
              <span>Evidence</span>
            </Link>

            <Link
              to={`/case/${caseId}/dossier`}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full py-1 text-[11px] font-medium transition-colors',
                path.includes('/dossier') ? 'text-accent' : 'text-muted'
              )}
            >
              <Archive className="w-5 h-5 mb-0.5" aria-hidden="true" />
              <span>Dossier</span>
            </Link>
          </>
        ) : null}
      </div>
    </nav>
  );
}
