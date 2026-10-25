import { FileSearch } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

export function NotFound() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-20 sm:px-8">
      <EmptyState
        icon={FileSearch}
        title="There is nothing at this address"
        action={
          <>
            <Button to="/dashboard" variant="primary">
              Go to your cases
            </Button>
            <Button to="/" variant="secondary">
              Back to the start
            </Button>
          </>
        }
      >
        <p>The page you were looking for does not exist. Nothing in your record has changed.</p>
      </EmptyState>
    </div>
  );
}
