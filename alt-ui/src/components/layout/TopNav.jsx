import React from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import QuickExit from './QuickExit';
import { Shield } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function TopNav() {
  const location = useLocation();
  const { caseId } = useParams();

  const isCaseRoute = location.pathname.startsWith('/case/');
  const currentPath = location.pathname;

  return (
    <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-sm border-b border-border no-print">
      <div className="max-w-[1080px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Left: Brand + primary navigation */}
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="flex items-center gap-2 text-ink hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded p-1"
          >
            <Shield className="w-5 h-5 text-accent" aria-hidden="true" />
            <span className="font-serif text-lg tracking-tight font-medium">VeraTrace</span>
          </Link>

          <nav className="hidden sm:flex items-center gap-4 text-sm" aria-label="Main Navigation">
            <Link
              to="/dashboard"
              className={cn(
                'text-sm transition-colors py-1',
                currentPath === '/dashboard' ? 'text-accent font-medium' : 'text-muted hover:text-ink'
              )}
            >
              Cases
            </Link>

            {caseId && (
              <>
                <span className="text-border" aria-hidden="true">/</span>
                <Link
                  to={`/case/${caseId}`}
                  className={cn(
                    'text-sm transition-colors py-1',
                    currentPath === `/case/${caseId}` ? 'text-accent font-medium' : 'text-muted hover:text-ink'
                  )}
                >
                  Overview
                </Link>
                <Link
                  to={`/case/${caseId}/evidence`}
                  className={cn(
                    'text-sm transition-colors py-1',
                    currentPath.includes('/evidence') ? 'text-accent font-medium' : 'text-muted hover:text-ink'
                  )}
                >
                  Evidence
                </Link>
                <Link
                  to={`/case/${caseId}/dossier`}
                  className={cn(
                    'text-sm transition-colors py-1',
                    currentPath.includes('/dossier') ? 'text-accent font-medium' : 'text-muted hover:text-ink'
                  )}
                >
                  Dossier
                </Link>
              </>
            )}
          </nav>
        </div>

        {/* Right: Quick Exit (always visible) */}
        <div>
          <QuickExit />
        </div>
      </div>
    </header>
  );
}
