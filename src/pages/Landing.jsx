import { ShieldCheck, Clock3, FileText, Lock, EyeOff, ArrowRight } from 'lucide-react';
import Button from '../components/Button';
import StatusChip from '../components/StatusChip';
import styles from './Landing.module.css';

const STEPS = [
  { n: '01', title: 'Start a private case', body: 'Name it something only you would recognize. Nothing is shared or visible to anyone else.' },
  { n: '02', title: 'Add evidence as it happens', body: 'Screenshots, messages, documents. Each one is recorded with its details so you can find it again.' },
  { n: '03', title: 'See it laid out clearly', body: 'A timeline and summary you can bring to someone you trust, whenever you decide to.' },
];

const REASSURANCE = [
  { Icon: Lock, title: 'Stays on your device', body: 'Nothing is uploaded to a server. Your records are yours alone.' },
  { Icon: EyeOff, title: 'Leave in one tap', body: 'Quick exit is on every screen, and the Escape key works anywhere.' },
  { Icon: ShieldCheck, title: 'Honest about limits', body: "We'll always tell you what a record does and doesn't prove." },
];

export default function Landing() {
  return (
    <>
      {/* ---------- Hero: asymmetric, text left, specimen card right ---------- */}
      <section className={styles.hero}>
        <div className={`${styles.heroInner} page`}>
          <div className={styles.heroCopy}>
            <p className="eyebrow">Evidence, kept carefully</p>
            <h1 className={styles.heroTitle}>
              You shouldn't have to hold it <em className={styles.em}>all</em> in your head.
            </h1>
            <p className={styles.heroLede}>
              VeraTrace helps you quietly collect and organize evidence of harassment or abuse —
              in one place, in your own time, at your own pace.
            </p>
            <div className={styles.heroActions}>
              <Button to="/dashboard" size="lg" iconRight={<ArrowRight />}>Open my cases</Button>
              <Button href="#how-it-works" variant="ghost" size="lg">See how it works</Button>
            </div>
            <p className={styles.heroFoot}>
              Free · No account needed · Works on your phone
            </p>
          </div>

          <div className={styles.heroVisual} aria-hidden="true">
            <div className={styles.specimen}>
              <div className={styles.specimenHead}>
                <span className={styles.specimenTitle}>Workplace harassment</span>
                <StatusChip status="IN_PROGRESS" size="sm" />
              </div>
              <ul className={styles.specimenList}>
                <li className={styles.specimenRow}>
                  <FileText className={styles.rowIcon} strokeWidth={2} />
                  <span className={styles.rowName}>chat-screenshot-1.png</span>
                  <StatusChip status="MATCH" size="sm" />
                </li>
                <li className={styles.specimenRow}>
                  <FileText className={styles.rowIcon} strokeWidth={2} />
                  <span className={styles.rowName}>email-thread.pdf</span>
                  <StatusChip status="UNVERIFIED" size="sm" />
                </li>
                <li className={styles.specimenRow}>
                  <FileText className={styles.rowIcon} strokeWidth={2} />
                  <span className={styles.rowName}>voicemail-03.m4a</span>
                  <StatusChip status="MATCH" size="sm" />
                </li>
              </ul>
              <div className={styles.specimenFoot}>
                <Clock3 className={styles.rowIcon} strokeWidth={2} />
                <span>6 items · first recorded 14 Sept</span>
              </div>
            </div>
            <div className={styles.specimenGlow} />
          </div>
        </div>
      </section>

      {/* ---------- Process strip: horizontal on desktop ---------- */}
      <section id="how-it-works" className={styles.process}>
        <div className="page">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Three steps, whenever you're ready</h2>
            <p className={styles.sectionLede}>
              There's no deadline and no pressure to finish. You can stop after step one and come back later.
            </p>
          </div>

          <ol className={styles.steps}>
            {STEPS.map((s) => (
              <li key={s.n} className={styles.step}>
                <span className={styles.stepNum}>{s.n}</span>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p className={styles.stepBody}>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Reassurance row ---------- */}
      <section className={styles.reassure}>
        <div className={`${styles.reassureInner} page`}>
          {REASSURANCE.map(({ Icon, title, body }) => (
            <div key={title} className={styles.reassureItem}>
              <span className={styles.reassureIcon}><Icon strokeWidth={1.8} aria-hidden="true" /></span>
              <div>
                <h3 className={styles.reassureTitle}>{title}</h3>
                <p className={styles.reassureBody}>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Honesty note ---------- */}
      <section className={styles.honesty}>
        <div className={`${styles.honestyInner} page`}>
          <p className="eyebrow">Worth knowing</p>
          <p className={styles.honestyText}>
            A matching hash shows a file hasn't changed since you added it. It doesn't prove who created
            the file, when the incident happened, or guarantee a record will be accepted as legal proof.
            Think of VeraTrace as a careful notebook — not a courtroom guarantee.
          </p>
        </div>
      </section>

      {/* ---------- Full-bleed CTA band, sits directly above the footer ---------- */}
      <section className={styles.ctaBand}>
        <div className={`${styles.ctaInner} page`}>
          <div>
            <h2 className={styles.ctaTitle}>Ready when you are</h2>
            <p className={styles.ctaBody}>Start with one screenshot. That's enough for today.</p>
          </div>
          <Button to="/dashboard" variant="secondary" size="lg" iconRight={<ArrowRight />}>
            Open my cases
          </Button>
        </div>
      </section>
    </>
  );
}
