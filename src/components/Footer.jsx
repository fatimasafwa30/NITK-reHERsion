import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { Logo } from './Logo';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ConfirmDialog';
import { useVera } from '../store/VeraStore';
import { useToast } from '../store/ToastProvider';

const LINKS = [
  { to: '/dashboard', label: 'Cases' },
  { to: '/verify', label: 'Verify a file' },
];

export function Footer() {
  const { resetDemo } = useVera();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  return (
    <footer className="border-t border-lilac bg-ivory" data-print="hide">
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
              A calm place to preserve evidence and keep an organised, timestamped record. Files are hashed on your
              own device.
            </p>
          </div>

          <nav aria-label="Footer" className="flex flex-col gap-2.5 text-[0.8125rem]">
            {LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="inline-flex min-h-11 w-fit items-center text-muted transition-colors hover:text-plum sm:min-h-0">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <hr className="rule my-8" />

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-xs leading-relaxed text-muted">
            This is a demonstration build. Case data lives only in this browser, and a matching hash shows that a
            file has not changed since it was added — it does not prove who created the file, and it is not a
            guarantee that any authority will accept it as proof.
          </p>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} className="shrink-0">
            <RotateCcw aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
            Reset demo data
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Reset the demo data?"
        description="Every case, file record and timeline event you added here will be discarded and the original sample data restored."
        confirmLabel="Reset data"
        onConfirm={() => {
          resetDemo();
          toast('Demo data reset', { detail: 'The original sample cases are back.' });
        }}
      />
    </footer>
  );
}
