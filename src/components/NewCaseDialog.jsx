import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/Button';
import { Dialog, DialogClose } from './ui/Dialog';
import { Field, Input, Select, Textarea } from './ui/Field';
import { useVera } from '../store/VeraStore';
import { useToast } from '../store/ToastProvider';

export function NewCaseDialog({ open, onOpenChange }) {
  const { createCase } = useVera();
  const toast = useToast();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [status, setStatus] = useState('OPEN');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setTitle('');
      setSummary('');
      setStatus('OPEN');
      setError('');
    }
  }, [open]);

  const submit = (event) => {
    event.preventDefault();
    if (!title.trim()) {
      setError('A case needs a title before it can be created.');
      return;
    }
    const caseId = createCase({ title, summary, status });
    onOpenChange(false);
    toast('Case created', { detail: title.trim() });
    navigate(`/case/${caseId}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start a new case"
      description="A case is a container for one situation — its files and its timeline. You can rename it later."
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button variant="primary" type="submit" form="new-case-form">
            Create case
          </Button>
        </>
      }
    >
      <form id="new-case-form" onSubmit={submit} className="space-y-5">
        <Field
          label="Case title"
          error={error}
          help="Something you will recognise at a glance. Avoid names if that feels safer."
        >
          {(props) => (
            <Input
              {...props}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (error) setError('');
              }}
              placeholder="Workplace harassment — messages & emails"
              autoFocus
            />
          )}
        </Field>

        <Field label="Short summary" hint="Optional">
          {(props) => (
            <Textarea
              {...props}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="What is happening, in a sentence or two."
            />
          )}
        </Field>

        <Field label="Status">
          {(props) => (
            <Select {...props} value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="CLOSED">Closed</option>
            </Select>
          )}
        </Field>
      </form>
    </Dialog>
  );
}
