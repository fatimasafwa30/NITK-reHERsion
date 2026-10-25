import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { FilePlus, FolderClosed, ShieldQuestionMark } from 'lucide-react';
import { cn } from '../lib/cn';
import { PageTransition } from '../motion/PageTransition';
import { RouteChrome } from '../motion/RouteChrome';
import { EASE } from '../motion/tokens';
import { Logo } from './Logo';
import { Footer } from './Footer';
import { QuickExitButton } from './QuickExit';
import { NewCaseDialog } from './NewCaseDialog';

const NAV = [
  { to: '/dashboard', label: 'Cases', icon: FolderClosed },
  { to: '/verify', label: 'Verify', icon: ShieldQuestionMark },
];

/**
 * App shell: a slim top bar on desktop, a bottom tab bar on mobile.
 * No sidebar — the content is a document, and documents want width.
 */
export function AppShell() {
  const location = useLocation();
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  // The dossier is a document; it fades in without moving.
  const fadeOnly = location.pathname.endsWith('/dossier');

  return (
    <div className="flex min-h-dvh flex-col bg-ivory">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-90 focus:rounded-md focus:border focus:border-violet-deep focus:bg-paper focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-plum"
      >
        Skip to main content
      </a>

      <header
        className="sticky top-0 z-40 border-b border-lilac bg-ivory/92 backdrop-blur-sm"
        data-print="hide"
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-5 sm:px-8">
          <Logo />

          <nav aria-label="Main" className="hidden flex-1 items-center gap-1 sm:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'relative inline-flex min-h-11 items-center rounded-md px-3 text-sm transition-colors duration-150',
                    isActive ? 'text-plum' : 'text-muted hover:bg-wash/70 hover:text-plum',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {item.label}
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
            ))}
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

      <main id="main" className="flex-1 pb-24 sm:pb-0">
        <PageTransition routeKey={location.pathname} fadeOnly={fadeOnly}>
          <Outlet />
        </PageTransition>
      </main>

      <RouteChrome />

      <Footer />

      {/* Mobile tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-lilac bg-ivory/96 backdrop-blur-sm sm:hidden"
        data-print="hide"
      >
        <ul className="mx-auto flex max-w-md">
          {NAV.map((item) => (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'relative flex min-h-14 flex-col items-center justify-center gap-1 pb-1 pt-2 text-[0.6875rem] font-medium transition-colors duration-[var(--dur-fast)]',
                    isActive ? 'text-violet-deep' : 'text-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <motion.span
                        layoutId="vt-tabbar-indicator"
                        aria-hidden="true"
                        className="absolute inset-x-5 top-0 h-[2px] rounded-full bg-violet-deep"
                        transition={{ duration: 0.2, ease: EASE.out }}
                      />
                    ) : null}
                    <item.icon
                      aria-hidden="true"
                      strokeWidth={isActive ? 1.75 : 1.5}
                      className="size-[18px]"
                    />
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
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
        </ul>
      </nav>

      <NewCaseDialog open={newCaseOpen} onOpenChange={setNewCaseOpen} />
    </div>
  );
}
