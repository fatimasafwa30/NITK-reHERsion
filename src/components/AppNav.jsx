import { NavLink } from 'react-router-dom';
import { LayoutGrid, FolderClosed, LifeBuoy, ShieldCheck, Home } from 'lucide-react';
import styles from './AppNav.module.css';

/* Secondary entries are presentational: support resources and safety
   content are not built yet (unassigned scope in DATA_CONTRACT open items). */
const SECONDARY = [
  { label: 'Support resources', Icon: LifeBuoy },
  { label: 'Privacy & safety', Icon: ShieldCheck },
];

export function SidebarNav() {
  return (
    <nav className={styles.nav} aria-label="Main sections">
      <NavLink
        to="/dashboard"
        className={({ isActive }) => `${styles.item} ${isActive ? styles.itemActive : ''}`}
      >
        <LayoutGrid className={styles.icon} aria-hidden="true" strokeWidth={2} />
        My cases
      </NavLink>

      <p className={styles.groupLabel}>Help</p>
      {SECONDARY.map(({ label, Icon }) => (
        <span key={label} className={`${styles.item} ${styles.itemMuted}`} aria-disabled="true">
          <Icon className={styles.icon} aria-hidden="true" strokeWidth={2} />
          {label}
        </span>
      ))}
    </nav>
  );
}

export function MobileTabBar() {
  return (
    <nav className={styles.tabBar} aria-label="Quick navigation">
      <NavLink to="/" end className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}>
        <Home aria-hidden="true" strokeWidth={2} />
        Home
      </NavLink>
      <NavLink to="/dashboard" className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}>
        <FolderClosed aria-hidden="true" strokeWidth={2} />
        Cases
      </NavLink>
      <span className={`${styles.tab} ${styles.tabMuted}`} aria-disabled="true">
        <LifeBuoy aria-hidden="true" strokeWidth={2} />
        Support
      </span>
    </nav>
  );
}
