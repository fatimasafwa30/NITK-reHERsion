import styles from './Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <p className={styles.disclaimer}>
          VeraTrace is a prototype to help you organize evidence and keep a clear record of what happened.
          It does not provide legal advice, and recording something here does not by itself make it legally
          admissible. If you are in immediate danger, please contact local emergency services.
        </p>
        <p className={styles.copy}>© {new Date().getFullYear()} VeraTrace. Your records stay private to you.</p>
      </div>
    </footer>
  );
}
