import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCaseStore } from '../hooks/useCaseStore';
import { Dialog, DialogContent, DialogTrigger } from '../components/ui/Dialog';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Textarea from '../components/ui/Textarea';
import Badge from '../components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import { formatDate } from '../lib/utils';
import { Plus, ChevronRight } from 'lucide-react';

export default function Dashboard() {
  const { cases, addCase } = useCaseStore();
  const [openNewCase, setOpenNewCase] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');

  // 3 Stats in a single plain line (no cards)
  const totalCases = cases.length;
  const activeCases = cases.filter((c) => c.status !== 'CLOSED').length;
  const totalEvidence = cases.reduce((acc, c) => acc + (c.evidenceCount || 0), 0);

  function handleCreateCase(e) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Case title is required.');
      return;
    }
    addCase({ title, summary });
    setTitle('');
    setSummary('');
    setError('');
    setOpenNewCase(false);
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl text-ink font-normal tracking-tight">Cases</h1>
          <p className="text-sm text-muted mt-1">Manage confidential incident logs and verified evidence files.</p>
        </div>

        <Dialog open={openNewCase} onOpenChange={setOpenNewCase}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>New case</span>
            </Button>
          </DialogTrigger>

          <DialogContent
            title="Create a new case"
            description="Start a private, organized log for a specific situation or pattern of incidents."
          >
            <form onSubmit={handleCreateCase} className="space-y-5 mt-4" noValidate>
              <Input
                id="case-title"
                label="Case title *"
                placeholder="e.g. Workplace harassment — messages & calls"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (error) setError('');
                }}
                error={error}
                autoFocus
              />

              <Textarea
                id="case-summary"
                label="Brief summary (optional)"
                placeholder="Provide short context on the incident or perpetrator..."
                rows={3}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <Button variant="ghost" onClick={() => setOpenNewCase(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create case</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* A single line of three stats (plain numbers, no cards) */}
      <div className="flex flex-wrap items-baseline gap-x-10 gap-y-4 py-4 border-y border-border text-sm">
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-2xl font-normal text-ink">{totalCases}</span>
          <span className="text-muted">Total cases</span>
        </div>
        <div className="text-border hidden sm:block" aria-hidden="true">•</div>
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-2xl font-normal text-ink">{activeCases}</span>
          <span className="text-muted">Active investigations</span>
        </div>
        <div className="text-border hidden sm:block" aria-hidden="true">•</div>
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-2xl font-normal text-ink">{totalEvidence}</span>
          <span className="text-muted">Preserved evidence files</span>
        </div>
      </div>

      {/* Cases list/table */}
      {cases.length === 0 ? (
        <EmptyState
          title="No cases logged yet"
          description="Create your first case to begin recording timeline events and preserving evidence files."
          actionLabel="New case"
          onAction={() => setOpenNewCase(true)}
        />
      ) : (
        <div className="border border-border rounded-lg overflow-hidden bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Case title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Evidence</TableHead>
                <TableHead className="hidden sm:table-cell">Last updated</TableHead>
                <TableHead className="w-12 text-right sr-only">View</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((c) => (
                <TableRow key={c.caseId} className="group">
                  <TableCell className="font-medium">
                    <Link
                      to={`/case/${c.caseId}`}
                      className="block hover:text-accent focus-visible:outline-none focus-visible:underline"
                    >
                      <span className="text-base text-ink font-medium">{c.title}</span>
                      {c.summary && (
                        <p className="text-xs text-muted font-normal line-clamp-1 mt-0.5 max-w-md">
                          {c.summary}
                        </p>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge status={c.status} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted text-sm font-mono">
                    {c.evidenceCount || 0} files
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted text-xs">
                    {formatDate(c.updatedAt || c.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      to={`/case/${c.caseId}`}
                      className="inline-flex p-2 text-muted group-hover:text-accent rounded transition-colors"
                      aria-label={`Open case ${c.title}`}
                    >
                      <ChevronRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
