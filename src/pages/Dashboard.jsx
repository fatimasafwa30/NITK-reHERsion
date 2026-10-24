import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, FolderClosed, FileCheck2, Clock3, ChevronRight } from 'lucide-react';
import Button from '../components/Button';
import StatCard from '../components/StatCard';
import StatusChip from '../components/StatusChip';
import EmptyState from '../components/EmptyState';
import { useCases } from '../hooks/useCases';
import styles from './Dashboard.module.css';

function relativeDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * @param {{ onNewCase?: () => void }} props
 * Person 3: pass `onNewCase` to open your case-creation flow. With no
 * handler the button keeps its current placeholder behaviour (no-op), so
 * you can wire this from a parent without editing this file.
 */
export default function Dashboard({ onNewCase }) {
  const [query, setQuery] = useState('');
  const { data: cases } = useCases();

  const filtered = cases.filter((c) =>
    c.title.toLowerCase().includes(query.trim().toLowerCase())
  );
  const totalEvidence = cases.reduce((sum, c) => sum + c.evidenceCount, 0);
  const activeCount = cases.filter((c) => c.status !== 'CLOSED').length;

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>My cases</h1>
          <p className={styles.subtitle}>Everything here stays private to you.</p>
        </div>
        {/* Case creation is Person 3's scope — presentational until onNewCase is supplied. */}
        <Button iconLeft={<Plus />} onClick={onNewCase}>New case</Button>
      </header>

      <section className={styles.stats} aria-label="Summary">
        <StatCard label="Active cases" value={activeCount} icon={<FolderClosed />} tone="accent" hint="Still being added to" />
        <StatCard label="Evidence items" value={totalEvidence} icon={<FileCheck2 />} hint="Across all cases" />
        <StatCard label="Last activity" value="20 Oct" icon={<Clock3 />} hint="Workplace harassment" />
      </section>

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <Search className={styles.searchIcon} aria-hidden="true" strokeWidth={2} />
          <label className="visually-hidden" htmlFor="case-search">Search cases</label>
          <input
            id="case-search"
            type="search"
            className={styles.search}
            placeholder="Search your cases…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <p className={styles.resultCount} role="status">
          {filtered.length} of {cases.length} {cases.length === 1 ? 'case' : 'cases'}
        </p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No cases match that search"
          description="Try a different word, or clear the search to see everything."
          action={<Button variant="ghost" onClick={() => setQuery('')}>Clear search</Button>}
        />
      ) : (
        <ul className={styles.list}>
          {filtered.map((c) => (
            <li key={c.caseId}>
              <Link to={`/case/${c.caseId}`} className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.rowTop}>
                    <h2 className={styles.rowTitle}>{c.title}</h2>
                    <StatusChip status={c.status} size="sm" />
                  </div>
                  <p className={styles.rowSummary}>{c.summary}</p>
                </div>

                <dl className={styles.rowMeta}>
                  <div className={styles.metaItem}>
                    <dt>Evidence</dt>
                    <dd>{c.evidenceCount}</dd>
                  </div>
                  <div className={styles.metaItem}>
                    <dt>Updated</dt>
                    <dd>{relativeDate(c.updatedAt)}</dd>
                  </div>
                </dl>

                <ChevronRight className={styles.chevron} aria-hidden="true" strokeWidth={2} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
