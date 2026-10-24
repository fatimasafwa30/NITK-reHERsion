import { useState } from 'react';
import Button from '../components/Button';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { mockCases } from '../data/mockData';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const [query, setQuery] = useState('');

  const filtered = mockCases.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()));
  const totalEvidence = mockCases.reduce((sum, c) => sum + c.evidenceCount, 0);
  const openCount = mockCases.filter((c) => c.status !== 'CLOSED').length;

  return (
    <div className="container">
      <div className={styles.header}>
        <div>
          <h1>My cases</h1>
          <p className={styles.subtitle}>Everything here is private to you.</p>
        </div>
        {/* Real case creation is wired by Person 3; this button is presentational for now. */}
        <Button>New case</Button>
      </div>

      <div className={styles.stats}>
        <StatCard label="Active cases" value={openCount} />
        <StatCard label="Total cases" value={mockCases.length} />
        <StatCard label="Evidence items recorded" value={totalEvidence} />
      </div>

      <div className={styles.toolbar}>
        <label className="visually-hidden" htmlFor="case-search">Search cases</label>
        <input
          id="case-search"
          type="search"
          placeholder="Search your cases…"
          className={styles.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No cases match your search"
          description="Try a different word, or clear the search to see all your cases."
        />
      ) : (
        <ul className={styles.list}>
          {filtered.map((c) => (
            <li key={c.caseId}>
              <Card to={`/case/${c.caseId}`} className={styles.caseCard}>
                <div className={styles.caseCardTop}>
                  <h2 className={styles.caseTitle}>{c.title}</h2>
                  <StatusBadge status={c.status} />
                </div>
                <p className={styles.caseSummary}>{c.summary}</p>
                <p className={styles.caseMeta}>
                  {c.evidenceCount} evidence item{c.evidenceCount === 1 ? '' : 's'} · updated{' '}
                  {new Date(c.updatedAt).toLocaleDateString()}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
