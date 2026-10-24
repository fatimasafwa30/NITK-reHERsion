import { useEffect, useRef, useState, useId } from 'react';
import { X } from 'lucide-react';
import Button from './Button';
import styles from './AddEventDialog.module.css';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog for adding a timeline event.
 *
 * Escape handling note: QuickExit listens for Escape on `window` to leave the
 * site. While this dialog is open we intercept Escape in the *capture* phase
 * and stop propagation, so Escape closes the dialog instead of exiting. With
 * no dialog open, Escape still quick-exits exactly as before — QuickExit
 * itself is untouched.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onSubmit: (event: object) => void,
 *   evidenceOptions?: {evidenceId: string, fileName: string}[],
 * }} props
 */
export default function AddEventDialog({ open, onClose, onSubmit, evidenceOptions = [] }) {
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);
  const titleId = useId();

  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [confidence, setConfidence] = useState('confirmed');
  const [relatedEvidenceId, setRelatedEvidenceId] = useState('');
  const [touched, setTouched] = useState(false);

  // Reset the form on open, and hand focus back to whatever opened the
  // dialog when it closes (cleanup runs exactly on close/unmount).
  useEffect(() => {
    if (!open) return undefined;

    setLabel(''); setDate(''); setTime('');
    setConfidence('confirmed'); setRelatedEvidenceId(''); setTouched(false);

    // Capture the opener BEFORE moving focus, then move focus into the
    // dialog. (Order matters: autoFocus would run before this effect and
    // make us capture a field inside the dialog as the "opener".)
    const opener = document.activeElement;
    firstFieldRef.current?.focus();

    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) {
        opener.focus();
      }
    };
  }, [open]);

  // Escape-to-close + focus trap.
  useEffect(() => {
    if (!open) return undefined;

    function onKeyDownCapture(e) {
      if (e.key === 'Escape') {
        // Stop QuickExit's window listener from also firing.
        e.stopPropagation();
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const nodes = dialogRef.current?.querySelectorAll(FOCUSABLE);
        if (!nodes || nodes.length === 0) return;
        const list = Array.from(nodes).filter((n) => !n.disabled);
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => window.removeEventListener('keydown', onKeyDownCapture, true);
  }, [open, onClose]);

  if (!open) return null;

  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (!label.trim()) return;

    // Matches the TimelineEvent shape in docs/DATA_CONTRACT.md exactly.
    const occurredAt = date
      ? new Date(`${date}T${time || '00:00'}`).toISOString()
      : null;

    onSubmit({
      eventId: `tl_local_${Date.now().toString(36)}`,
      occurredAt,
      timeConfidence: confidence,
      label: label.trim(),
      relatedEvidenceId: relatedEvidenceId || null,
    });
    onClose();
  }

  const labelMissing = touched && !label.trim();

  return (
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
      >
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>Add a timeline event</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <X strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <p className={styles.intro}>
          Add something that happened. If you're not sure exactly when, say so — an uncertain
          date is still worth recording.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="event-label">
              What happened <span className={styles.req}>*</span>
            </label>
            <textarea
              id="event-label"
              ref={firstFieldRef}
              className={styles.textarea}
              rows={3}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              aria-invalid={labelMissing || undefined}
              aria-describedby={labelMissing ? 'event-label-error' : undefined}
              placeholder="e.g. Received a threatening message on my work account"
            />
            {labelMissing && (
              <p id="event-label-error" className={styles.error} role="alert">
                Please describe what happened.
              </p>
            )}
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="event-date">Date</label>
              <input
                id="event-date"
                type="date"
                className={styles.input}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="event-time">
                Time <span className={styles.optional}>(optional)</span>
              </label>
              <input
                id="event-time"
                type="time"
                className={styles.input}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={!date}
              />
            </div>
          </div>

          <fieldset className={styles.fieldset}>
            <legend className={styles.label}>How sure are you about the time?</legend>
            <div className={styles.radios}>
              <label className={styles.radio}>
                <input
                  type="radio"
                  name="confidence"
                  value="confirmed"
                  checked={confidence === 'confirmed'}
                  onChange={() => setConfidence('confirmed')}
                />
                I'm confident
              </label>
              <label className={styles.radio}>
                <input
                  type="radio"
                  name="confidence"
                  value="uncertain"
                  checked={confidence === 'uncertain'}
                  onChange={() => setConfidence('uncertain')}
                />
                It's approximate
              </label>
            </div>
          </fieldset>

          {evidenceOptions.length > 0 && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="event-evidence">
                Link to evidence <span className={styles.optional}>(optional)</span>
              </label>
              <select
                id="event-evidence"
                className={styles.input}
                value={relatedEvidenceId}
                onChange={(e) => setRelatedEvidenceId(e.target.value)}
              >
                <option value="">Not linked to a file</option>
                {evidenceOptions.map((item) => (
                  <option key={item.evidenceId} value={item.evidenceId}>{item.fileName}</option>
                ))}
              </select>
            </div>
          )}

          <div className={styles.actions}>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <button type="submit" className={styles.submit}>Add to timeline</button>
          </div>
        </form>
      </div>
    </>
  );
}
