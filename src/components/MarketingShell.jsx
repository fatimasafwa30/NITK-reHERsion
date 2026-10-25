import { Link, Outlet } from 'react-router-dom';
import { Logo } from './Logo';
import { Footer } from './Footer';
import { QuickExitButton } from './QuickExit';

export function MarketingShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-ivory">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-90 focus:rounded-md focus:border focus:border-violet-deep focus:bg-paper focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-plum"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b border-lilac/70 bg-ivory/92 backdrop-blur-sm" data-print="hide">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-5 sm:px-8">
          <Logo />
          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <Link
              to="/verify"
              className="hidden min-h-11 items-center rounded-md px-3 text-sm text-muted transition-colors hover:bg-wash/70 hover:text-plum sm:inline-flex"
            >
              Verify a file
            </Link>
            <Link
              to="/dashboard"
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-muted transition-colors hover:bg-wash/70 hover:text-plum"
            >
              Cases
            </Link>
            <QuickExitButton />
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
