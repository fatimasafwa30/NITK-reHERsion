import { Link } from 'react-router-dom';
import Logo from './Logo';
import styles from './Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`${styles.inner} page`}>
        <div className={styles.brandCol}>
          <Logo inverted />
          <p className={styles.tagline}>
            A private place to organize evidence and keep a clear record of what happened.
          </p>
        </div>

        <div className={styles.linksCol}>
          <p className={styles.colTitle}>VeraTrace</p>
          <Link to="/dashboard" className={styles.link}>My cases</Link>
          <Link to="/" className={styles.link}>How it works</Link>
        </div>

        <div className={styles.noteCol}>
          <p className={styles.colTitle}>Before you rely on this</p>
          <p className={styles.note}>
            VeraTrace is a prototype. It can show that a file hasn't changed since you added it,
            which may support your account of events — but it does not prove who created a file,
            when an incident happened, or that a record will be accepted as legal proof.
            If you are in immediate danger, contact local emergency services.
          </p>
        </div>
      </div>

      <div className={`${styles.baseline} page`}>
        <p>© {new Date().getFullYear()} VeraTrace</p>
        <p>Press <kbd className={styles.kbd}>Esc</kbd> at any time to leave this site.</p>
      </div>
    </footer>
  );
}
