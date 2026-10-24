import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import { ArrowRight, ShieldCheck, Lock, FileText } from 'lucide-react';

export default function Landing() {
  return (
    <div className="py-6 sm:py-16 max-w-3xl">
      {/* Editorial Hero */}
      <div className="space-y-6">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-accent-soft text-accent text-xs font-medium">
          <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Local, client-side cryptographic verification</span>
        </div>

        <h1 className="font-serif text-4xl sm:text-5xl lg:text-[56px] text-ink font-normal leading-[1.1] tracking-tight">
          A quiet, verifiable record of what you are experiencing.
        </h1>

        <p className="text-lg sm:text-xl text-muted leading-relaxed font-normal max-w-2xl">
          VeraTrace is built for women facing harassment, stalking, or digital abuse. It organizes your timeline, calculates permanent cryptographic fingerprints for evidence files, and prepares an honest dossier.
        </p>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-4 pt-2">
          <Link to="/dashboard">
            <Button size="lg" className="gap-2">
              <span>View demo cases</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Button>
          </Link>

          <a
            href="#limits"
            className="text-sm font-medium text-muted hover:text-ink underline underline-offset-4 decoration-border transition-colors px-2 py-2"
          >
            Read about our verification limits
          </a>
        </div>
      </div>

      <div className="border-t border-border my-16 sm:my-20" />

      {/* 3-Step Plain List (No card grids) */}
      <section className="space-y-10" aria-labelledby="how-it-works-heading">
        <h2 id="how-it-works-heading" className="font-serif text-2xl sm:text-3xl text-ink font-normal tracking-tight">
          How VeraTrace preserves your account
        </h2>

        <ol className="space-y-8 pl-1">
          <li className="flex items-start gap-4 sm:gap-6">
            <span className="flex-shrink-0 w-8 h-8 rounded-full border border-border bg-surface text-ink font-mono text-sm flex items-center justify-center font-medium mt-0.5">
              1
            </span>
            <div className="space-y-1">
              <h3 className="font-medium text-ink text-base">Record every incident as it occurs</h3>
              <p className="text-muted text-sm sm:text-base leading-relaxed">
                Log messages, calls, in-person confrontations, or online activity. If an exact timestamp is unknown or approximate, VeraTrace records that uncertainty transparently.
              </p>
            </div>
          </li>

          <li className="flex items-start gap-4 sm:gap-6">
            <span className="flex-shrink-0 w-8 h-8 rounded-full border border-border bg-surface text-ink font-mono text-sm flex items-center justify-center font-medium mt-0.5">
              2
            </span>
            <div className="space-y-1">
              <h3 className="font-medium text-ink text-base">Fingerprint files with SHA-256</h3>
              <p className="text-muted text-sm sm:text-base leading-relaxed">
                Screenshots, audio recordings, and PDF documents are hashed immediately in your browser. If a file is ever questioned, you can re-verify that not a single byte has changed.
              </p>
            </div>
          </li>

          <li className="flex items-start gap-4 sm:gap-6">
            <span className="flex-shrink-0 w-8 h-8 rounded-full border border-border bg-surface text-ink font-mono text-sm flex items-center justify-center font-medium mt-0.5">
              3
            </span>
            <div className="space-y-1">
              <h3 className="font-medium text-ink text-base">Generate an organized, printable dossier</h3>
              <p className="text-muted text-sm sm:text-base leading-relaxed">
                Export an organized summary with clear timelines and verification ledgers, designed specifically for sharing with support counselors, legal representatives, or authorities.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <div className="border-t border-border my-16 sm:my-20" />

      {/* Honest Limits Section */}
      <section id="limits" className="p-6 sm:p-8 border border-border rounded-lg bg-surface space-y-3" aria-labelledby="limits-heading">
        <div className="flex items-center gap-2 text-muted">
          <Lock className="w-4 h-4 text-accent" aria-hidden="true" />
          <h2 id="limits-heading" className="text-xs font-semibold uppercase tracking-wider text-muted">
            Honest boundaries & cryptographic truth
          </h2>
        </div>
        <p className="text-sm text-ink leading-relaxed font-normal">
          A matching SHA-256 hash proves that a digital file has not been altered or tampered with since the moment you recorded its hash in VeraTrace.
        </p>
        <p className="text-sm text-muted leading-relaxed font-normal">
          It does <strong>not</strong> prove who created the file, corroborate the real-world truth of an event, or guarantee legal admissibility on its own. VeraTrace provides calm, tamper-evident organization — never legal guarantees or false promises.
        </p>
      </section>
    </div>
  );
}
