import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/Button';
import { Dialog, DialogClose } from './ui/Dialog';
import { Field, Input, Select, Textarea } from './ui/Field';
import { useVera } from '../store/VeraStore';
import { useToast } from '../store/ToastProvider';

export function NewCaseDialog({ open, onOpenChange, onClose, onSubmit }) {
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
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [status, setStatus] = useState('OPEN');
  const [error, setError] = useState('');

  const handleClose = () => {
    onOpenChange?.(false);
    onClose?.();
  };

  useEffect(() => {
    if (open) {
      setTitle('');
      setSummary('');
      setStatus('OPEN');
      setError('');
    }
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    if (!title.trim()) {
      setError('A case needs a title before it can be created.');
      return;
    }

    if (onSubmit) {
      onSubmit({ title: title.trim(), summary: summary.trim(), status });
      handleClose();
      return;
    }

    if (vera?.createCase) {
      const caseId = await vera.createCase({ title, summary, status });
      handleClose();
      toast('Case created', { detail: title.trim() });
      navigate(`/case/${caseId}`);
    } else {
      handleClose();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) handleClose();
        else onOpenChange?.(val);
      }}
      title="Start a new case"
      description="A case is a container for one situation — its files and its timeline. You can rename it later."
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
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
              placeholder="e.g. Unwanted messages — October 2026"
              autoFocus
            />
          )}
        </Field>

        <Field label="Summary" hint="Optional">
          {(props) => (
            <Textarea
              {...props}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="A few sentences to help you or an advocate remember what this case covers."
              rows={3}
            />
          )}
        </Field>

        <Field label="Status">
          {(props) => (
            <Select {...props} value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="OPEN">Open — still adding evidence</option>
              <option value="PRESERVED">Preserved — sealed for the record</option>
              <option value="ARCHIVED">Archived — inactive</option>
            </Select>
          )}
        </Field>
      </form>
    </Dialog>
  );
}

export default NewCaseDialog;
