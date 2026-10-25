import { useEffect, useState } from 'react';
import { Button } from './ui/Button';
import { Dialog, DialogClose } from './ui/Dialog';
import { Field, Input, Select, Textarea, Label } from './ui/Field';
import { useVera } from '../store/VeraStore';
import { useToast } from '../store/ToastProvider';
import { cn } from '../lib/cn';

const CONFIDENCE = [
  {
    value: 'confirmed',
    title: 'Confirmed',
    body: 'I am sure of this date.',
  },
  {
    value: 'uncertain',
    title: 'Date uncertain',
    body: 'Roughly when it happened. It will be marked as uncertain.',
  },
];

export function AddEventDialog({
  open,
  onOpenChange,
  onClose,
  onSubmit,
  caseId,
  evidence = [],
  evidenceOptions = [],
}) {
  const vera = (() => {
    try {
      return useVera();
    } catch {
      return null;
    }
  })();
  const toast = (() => {
    try {
      return useToast();
    } catch {
      return () => {};
    }
  })();

  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [confidence, setConfidence] = useState('confirmed');
  const [relatedEvidenceId, setRelatedEvidenceId] = useState('');
  const [platform, setPlatform] = useState('');
  const [senderHandle, setSenderHandle] = useState('');
  const [blockedPrior, setBlockedPrior] = useState(false);
  const [errors, setErrors] = useState({});

  const effectiveEvidence = evidence.length ? evidence : evidenceOptions;

  const handleClose = () => {
    onOpenChange?.(false);
    onClose?.();
  };

  useEffect(() => {
    if (open) {
      setLabel('');
      setDate('');
      setTime('');
      setConfidence('confirmed');
      setRelatedEvidenceId('');
      setPlatform('');
      setSenderHandle('');
      setBlockedPrior(false);
      setErrors({});
    }
  }, [open]);

  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (!label.trim()) next.label = 'Describe what happened so the entry means something later.';
    if (confidence === 'confirmed' && !date) next.date = 'A confirmed event needs a date, or mark it uncertain.';
    setErrors(next);
    if (Object.keys(next).length) return;

    // A date with no time is stored at midnight; no time is invented.
    const occurredAt = date ? new Date(`${date}T${time || '00:00'}`).toISOString() : null;

    if (onSubmit) {
      onSubmit({
        label: label.trim(),
        occurredAt,
        timeConfidence: confidence,
        relatedEvidenceId: relatedEvidenceId || null,
        platform: platform || undefined,
        senderHandle: senderHandle.trim() || undefined,
        blockedPrior: Boolean(blockedPrior),
      });
    } else if (vera?.addEvent && caseId) {
      vera.addEvent(caseId, {
        label,
        occurredAt,
        timeConfidence: confidence,
        relatedEvidenceId,
        platform: platform || undefined,
        senderHandle: senderHandle.trim() || undefined,
        blockedPrior: Boolean(blockedPrior),
      });
    }

    handleClose();
    toast('Event added to the timeline', {
      detail: occurredAt ? undefined : 'Recorded without a date, marked uncertain.',
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) handleClose();
        else onOpenChange?.(val);
      }}
      title="Add a timeline event"
      description="Events can be added at any time. An uncertain date is better than no record."
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          </DialogClose>
          <Button variant="primary" type="submit" form="add-event-form">
            Add event
          </Button>
        </>
      }
    >
      <form id="add-event-form" onSubmit={submit} className="space-y-5">
        <Field label="What happened" error={errors.label}>
          {(props) => (
            <Textarea
              {...props}
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                if (errors.label) setErrors((e) => ({ ...e, label: undefined }));
              }}
              placeholder="First unwanted message received"
              autoFocus
            />
          )}
        </Field>

        <fieldset>
          <legend className="pb-1.5 text-[0.8125rem] font-medium text-plum">How sure are you of the date?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CONFIDENCE.map((option) => (
              <label
                key={option.value}
                className={cn(
                  'flex cursor-pointer gap-2.5 rounded-md border px-3 py-3 transition-colors duration-150',
                  confidence === option.value
                    ? 'border-violet-deep bg-wash/70'
                    : 'border-lilac bg-paper hover:border-violet',
                )}
              >
                <input
                  type="radio"
                  name="confidence"
                  value={option.value}
                  checked={confidence === option.value}
                  onChange={() => {
                    setConfidence(option.value);
                    setErrors((e) => ({ ...e, date: undefined }));
                  }}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-violet-deep)]"
                />
                <span className="min-w-0">
                  <span className="block text-[0.8125rem] font-medium text-plum">{option.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{option.body}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Date"
            hint={confidence === 'uncertain' ? 'Optional' : undefined}
            error={errors.date}
          >
            {(props) => (
              <Input
                {...props}
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  if (errors.date) setErrors((e) => ({ ...e, date: undefined }));
                }}
              />
            )}
          </Field>
          <Field label="Time" hint="Optional">
            {(props) => <Input {...props} type="time" value={time} onChange={(event) => setTime(event.target.value)} />}
          </Field>
        </div>

        <div>
          <Label htmlFor="related-evidence" hint="Optional">
            Related evidence
          </Label>
          <Select
            id="related-evidence"
            value={relatedEvidenceId}
            onChange={(event) => setRelatedEvidenceId(event.target.value)}
            disabled={!effectiveEvidence.length}
          >
            <option value="">No related file</option>
            {effectiveEvidence.map((record) => (
              <option key={record.evidenceId} value={record.evidenceId}>
                {record.fileName}
              </option>
            ))}
          </Select>
          {!effectiveEvidence.length ? (
            <p className="mt-1.5 text-xs text-muted">This case has no sealed files yet.</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 pt-1 border-t border-lilac/50">
          <div>
            <Label htmlFor="event-platform" hint="Optional">
              Platform / Source
            </Label>
            <Select
              id="event-platform"
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
            >
              <option value="">Auto-detect from text</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Instagram">Instagram</option>
              <option value="Email">Email</option>
              <option value="Facebook">Facebook</option>
              <option value="Telegram">Telegram</option>
              <option value="Phone Call">Phone / Voicemail</option>
              <option value="SMS">SMS / Text</option>
              <option value="Other">Other</option>
            </Select>
          </div>

          <Field label="Sender handle or phone" hint="Optional">
            {(props) => (
              <Input
                {...props}
                type="text"
                value={senderHandle}
                onChange={(event) => setSenderHandle(event.target.value)}
                placeholder="e.g. @anonymous or +91 98..."
              />
            )}
          </Field>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-lilac/70 bg-wash/40 p-3 text-xs text-plum hover:bg-wash/70">
          <input
            type="checkbox"
            checked={blockedPrior}
            onChange={(e) => setBlockedPrior(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded accent-[var(--color-violet-deep)]"
          />
          <span>
            <strong className="block font-medium">Contact resumed after block</strong>
            <span className="text-muted text-[0.6875rem]">
              Check this if this contact occurred after you had previously blocked the sender or explicitly requested no contact.
            </span>
          </span>
        </label>
      </form>
    </Dialog>
  );
}

export default AddEventDialog;
