import Button from '../components/Button';
import Card from '../components/Card';
import styles from './Landing.module.css';

const STEPS = [
  {
    title: 'Start a private case',
    body: 'Give it a name only you will recognize. Nothing is shared or visible to anyone else.',
  },
  {
    title: 'Add evidence as it happens',
    body: 'Screenshots, messages, documents — each one is recorded with its details so you can find it again later.',
  },
  {
    title: 'See it laid out clearly',
    body: 'A simple timeline and summary, ready whenever you need to show someone what happened.',
  },
];

export default function Landing() {
  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <p className={styles.eyebrow}>A private space to keep track of what happened</p>
          <h1 className={styles.heroTitle}>You shouldn't have to remember it all on your own.</h1>
          <p className={styles.heroSubtitle}>
            VeraTrace helps you quietly collect, organize and keep evidence of online abuse or harassment —
            in one place, in your own time, at your own pace.
          </p>
          <div className={styles.heroActions}>
            <Button to="/dashboard">Go to my cases</Button>
            <Button href="#how-it-works" variant="ghost">How it works</Button>
          </div>
        </div>
      </section>

      <section id="how-it-works" className={styles.section}>
        <div className="container">
          <h2>How it works</h2>
          <div className={styles.stepsGrid}>
            {STEPS.map((step, i) => (
              <Card key={step.title} className={styles.stepCard}>
                <span className={styles.stepNumber}>{i + 1}</span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepBody}>{step.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <Card className={styles.honestyCard}>
            <h2>Worth knowing before you start</h2>
            <p>
              VeraTrace helps you keep a clear, organized record — it can show that a file hasn't changed
              since you added it, which can support your account of events. It does not independently prove
              who created a file, when something happened, or guarantee that your records will be accepted
              as legal proof. Think of it as a careful notebook, not a courtroom guarantee.
            </p>
          </Card>
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <Card className={styles.ctaCard}>
            <h2 className={styles.ctaTitle}>Ready when you are</h2>
            <p>No account sign-up friction, no judgment. Start whenever it feels right.</p>
            <Button to="/dashboard">Go to my cases</Button>
          </Card>
        </div>
      </section>
    </>
  );
}
