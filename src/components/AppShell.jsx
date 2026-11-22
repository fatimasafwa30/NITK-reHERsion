import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Activity,
  Camera,
  Clock3,
  FileDown,
  FilePlus,
  FileText,
  Fingerprint,
  FolderClosed,
  Layers,
  Link2,
  Lock,
  Network,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestionMark,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { PageTransition } from '../motion/PageTransition';
import { RouteChrome } from '../motion/RouteChrome';
import { EASE } from '../motion/tokens';
import { Logo } from './Logo';
import { Footer } from './Footer';
import { QuickExitButton } from './QuickExit';
import { NewCaseDialog } from './NewCaseDialog';

const CASE_TABS = [
  { path: '', label: 'Overview', icon: FileText, end: true },
  { path: '/capture', label: 'Capture', icon: Camera },
  { path: '/evidence', label: 'Evidence Vault', icon: Layers },
  { path: '/integrity', label: 'Integrity', icon: Fingerprint },
  { path: '/analysis', label: 'Intelligence', icon: Network },
  { path: '/timeline', label: 'Timeline', icon: Clock3 },
  { path: '/chain-of-custody', label: 'Custody Chain', icon: Link2 },
  { path: '/dossier', label: 'Dossier', icon: FileDown },
  { path: '/safety', label: 'Safety Lock', icon: Lock },
];

/**
 * App shell: a slim top bar on desktop, a contextual case subnav strip,
 * and a responsive bottom tab bar on mobile.
 */
export function AppShell() {
  const location = useLocation();
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  // The dossier is a document; it fades in without moving.
  const fadeOnly = location.pathname.endsWith('/dossier');

  // Detect active case from URL path: /case/:caseId/*
  const caseMatch = location.pathname.match(/\/case\/([^/]+)/);
  const activeCaseId = caseMatch ? caseMatch[1] : null;

  return (
    <div className="flex min-h-dvh flex-col bg-ivory">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-90 focus:rounded-md focus:border focus:border-violet-deep focus:bg-paper focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-plum"
      >
        Skip to main content
      </a>

      <header
        className="sticky top-0 z-40 border-b border-lilac bg-ivory/95 backdrop-blur-sm"
        data-print="hide"
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-5 sm:px-8">
          <Logo />

          <nav aria-label="Main" className="hidden flex-1 items-center gap-1 sm:flex">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                cn(
                  'relative inline-flex min-h-11 items-center rounded-md px-3 text-sm transition-colors duration-150',
                  isActive && !activeCaseId ? 'text-plum font-medium' : 'text-muted hover:bg-wash/70 hover:text-plum',
                )
              }
            >
              Cases
            </NavLink>

            <NavLink
              to="/verify"
              className={({ isActive }) =>
                cn(
                  'relative inline-flex min-h-11 items-center rounded-md px-3 text-sm transition-colors duration-150',
                  isActive ? 'text-plum' : 'text-muted hover:bg-wash/70 hover:text-plum',
                )
              }
            >
              {({ isActive }) => (
                <>
                  Verify
                  {isActive ? (
                    <motion.span
                      layoutId="vt-nav-underline"
                      aria-hidden="true"
                      className="absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full bg-violet-deep"
                      transition={{ duration: 0.2, ease: EASE.out }}
                    />
                  ) : null}
                </>
              )}
            </NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <button
              type="button"
              onClick={() => setNewCaseOpen(true)}
              className="hidden min-h-11 items-center gap-1.5 rounded-md px-3 text-sm text-muted transition-colors hover:bg-wash/70 hover:text-plum sm:inline-flex"
            >
              <FilePlus aria-hidden="true" strokeWidth={1.5} className="size-4" />
              New case
            </button>
            <QuickExitButton />
          </div>
        </div>
      </header>

      {/* Case Sub-navigation Bar */}
      {activeCaseId && (
        <div
          className="sticky top-16 z-30 border-b border-lilac/80 bg-paper/95 backdrop-blur-sm"
          data-print="hide"
          aria-label="Case Sub-navigation"
        >
          <div className="mx-auto flex max-w-6xl items-center gap-1.5 overflow-x-auto px-5 py-2 scrollbar-none sm:px-8">
            <span className="mono shrink-0 rounded border border-lilac bg-wash/80 px-2 py-0.5 text-[0.6875rem] font-bold text-violet-deep">
              {activeCaseId}
            </span>

            <div className="h-4 w-px bg-lilac/70 shrink-0 mx-1" />

            {CASE_TABS.map((tab) => {
              const TabIcon = tab.icon;
              const targetUrl = `/case/${activeCaseId}${tab.path}`;
              return (
                <NavLink
                  key={tab.path}
                  to={targetUrl}
                  end={tab.end}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-violet-deep text-white shadow-xs font-semibold'
                        : 'text-muted hover:bg-wash hover:text-plum',
                    )
                  }
                >
                  <TabIcon className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>{tab.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      )}

      <main id="main" className="flex-1 pb-24 sm:pb-0">
        <PageTransition routeKey={location.pathname} fadeOnly={fadeOnly}>
          <Outlet />
        </PageTransition>
      </main>

      <RouteChrome />

      <Footer />

      {/* Mobile tab bar */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-lilac bg-ivory/96 backdrop-blur-sm sm:hidden"
        data-print="hide"
      >
        <ul className="mx-auto flex max-w-md">
          <li className="flex-1">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 pb-1 pt-2 text-[0.6875rem] font-medium transition-colors',
                  isActive && !activeCaseId ? 'text-violet-deep' : 'text-muted',
                )
              }
            >
              <FolderClosed aria-hidden="true" className="size-[18px]" />
              Cases
            </NavLink>
          </li>

          {activeCaseId ? (
            <>
              <li className="flex-1">
                <NavLink
                  to={`/case/${activeCaseId}`}
                  end
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-14 flex-col items-center justify-center gap-1 pb-1 pt-2 text-[0.6875rem] font-medium transition-colors',
                      isActive ? 'text-violet-deep font-semibold' : 'text-muted',
                    )
                  }
                >
                  <FileText aria-hidden="true" className="size-[18px]" />
                  Overview
                </NavLink>
              </li>

              <li className="flex-1">
                <NavLink
                  to={`/case/${activeCaseId}/capture`}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-14 flex-col items-center justify-center gap-1 pb-1 pt-2 text-[0.6875rem] font-medium transition-colors',
                      isActive ? 'text-violet-deep font-semibold' : 'text-muted',
                    )
                  }
                >
                  <Camera aria-hidden="true" className="size-[18px]" />
                  Capture
                </NavLink>
              </li>

              <li className="flex-1">
                <NavLink
                  to={`/case/${activeCaseId}/evidence`}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-14 flex-col items-center justify-center gap-1 pb-1 pt-2 text-[0.6875rem] font-medium transition-colors',
                      isActive ? 'text-violet-deep font-semibold' : 'text-muted',
                    )
                  }
                >
                  <Layers aria-hidden="true" className="size-[18px]" />
                  Vault
                </NavLink>
              </li>

              <li className="flex-1">
                <NavLink
                  to={`/case/${activeCaseId}/analysis`}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-14 flex-col items-center justify-center gap-1 pb-1 pt-2 text-[0.6875rem] font-medium transition-colors',
                      isActive ? 'text-violet-deep font-semibold' : 'text-violet-deep/80',
                    )
                  }
                >
                  <Network aria-hidden="true" className="size-[18px]" />
                  Intel
                </NavLink>
              </li>

              <li className="flex-1">
                <NavLink
                  to={`/case/${activeCaseId}/dossier`}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-14 flex-col items-center justify-center gap-1 pb-1 pt-2 text-[0.6875rem] font-medium transition-colors',
                      isActive ? 'text-violet-deep font-semibold' : 'text-muted',
                    )
                  }
                >
                  <FileDown aria-hidden="true" className="size-[18px]" />
                  Dossier
                </NavLink>
              </li>
            </>
          ) : (
            <>
              <li className="flex-1">
                <NavLink
                  to="/verify"
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-14 flex-col items-center justify-center gap-1 pb-1 pt-2 text-[0.6875rem] font-medium transition-colors',
                      isActive ? 'text-violet-deep' : 'text-muted',
                    )
                  }
                >
                  <ShieldQuestionMark aria-hidden="true" className="size-[18px]" />
                  Verify
                </NavLink>
              </li>
              <li className="flex-1">
                <button
                  type="button"
                  onClick={() => setNewCaseOpen(true)}
                  className="flex min-h-14 w-full flex-col items-center justify-center gap-1 pb-1 pt-2 text-[0.6875rem] font-medium text-muted"
                >
                  <FilePlus aria-hidden="true" strokeWidth={1.5} className="size-[18px]" />
                  New case
                </button>
              </li>
            </>
          )}
        </ul>
      </nav>

      <NewCaseDialog open={newCaseOpen} onOpenChange={setNewCaseOpen} />
    </div>
  );
}

export default AppShell;
