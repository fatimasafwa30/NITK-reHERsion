import { useState } from 'react';
import { NavLink, Link, Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import Logo from '../components/Logo';
import QuickExit from '../components/QuickExit';
import Button from '../components/Button';
import Footer from '../components/Footer';
import styles from './MarketingLayout.module.css';

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/dashboard', label: 'My cases' },
];

export default function MarketingLayout() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>

      <header className={styles.topbar}>
        <div className={`${styles.inner} page`}>
          <Link to="/" className={styles.brand} onClick={() => setOpen(false)}>
            <Logo />
          </Link>

          <nav className={styles.desktopNav} aria-label="Primary">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => `${styles.link} ${isActive ? styles.linkActive : ''}`}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          {/* Quick Exit sits outside the collapsible nav so it is present at
              every breakpoint — it must never hide behind a menu. */}
          <div className={styles.actions}>
            <QuickExit />
            <Button to="/dashboard" size="sm" className={styles.navCta}>Open VeraTrace</Button>
            <button
              type="button"
              className={styles.menuToggle}
              aria-expanded={open}
              aria-controls="marketing-nav"
              onClick={() => setOpen((v) => !v)}
            >
              <span className="visually-hidden">{open ? 'Close menu' : 'Open menu'}</span>
              {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>
          </div>
        </div>

        {open && (
          <nav id="marketing-nav" className={styles.mobileNav} aria-label="Primary mobile">
            <div className="page">
              {LINKS.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  className={({ isActive }) => `${styles.mobileLink} ${isActive ? styles.mobileLinkActive : ''}`}
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </NavLink>
              ))}
              <Button to="/dashboard" full className={styles.mobileCta} onClick={() => setOpen(false)}>
                Open VeraTrace
              </Button>
            </div>
          </nav>
        )}
      </header>

      <main id="main">
        <Outlet />
      </main>

      <Footer />
    </>
  );
}
