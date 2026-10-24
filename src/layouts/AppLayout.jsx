import { Link, Outlet } from 'react-router-dom';
import Logo from '../components/Logo';
import QuickExit from '../components/QuickExit';
import { SidebarNav, MobileTabBar } from '../components/AppNav';
import styles from './AppLayout.module.css';

export default function AppLayout() {
  return (
    <div className={styles.shell}>
      <a href="#main" className="skip-link">Skip to main content</a>

      <aside className={styles.sidebar}>
        <Link to="/" className={styles.brand}><Logo /></Link>
        <SidebarNav />
        <p className={styles.sidebarNote}>
          Your records stay on this device. Nothing is uploaded.
        </p>
      </aside>

      <div className={styles.main}>
        {/* Quick Exit lives in the persistent top bar, never inside a
            collapsible menu, so it is reachable at every breakpoint. */}
        <header className={styles.topbar}>
          <Link to="/" className={styles.mobileBrand}><Logo /></Link>
          <QuickExit />
        </header>

        <main id="main" className={styles.content}>
          <Outlet />
        </main>
      </div>

      <MobileTabBar />
    </div>
  );
}
