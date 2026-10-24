import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import QuickExit from './QuickExit';
import styles from './Navbar.module.css';

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/dashboard', label: 'My cases' },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.nav}>
      <div className={`${styles.inner} container`}>
        <NavLink to="/" className={styles.brand} onClick={() => setOpen(false)}>
          VeraTrace
        </NavLink>

        <button
          type="button"
          className={styles.menuToggle}
          aria-expanded={open}
          aria-controls="primary-navigation"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="visually-hidden">{open ? 'Close menu' : 'Open menu'}</span>
          <span aria-hidden="true" className={styles.menuIcon}>{open ? '✕' : '☰'}</span>
        </button>

        <nav id="primary-navigation" className={`${styles.links} ${open ? styles.linksOpen : ''}`} aria-label="Primary">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.linkActive : ''}`}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </NavLink>
          ))}
          <div className={styles.exitSlot}>
            <QuickExit />
          </div>
        </nav>
      </div>
    </header>
  );
}
