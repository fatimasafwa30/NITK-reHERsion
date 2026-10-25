/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module I: Formal PDF Summary Report Builder (PdfDossierBuilder)
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 3 (Module I), 5 (PDF Generation via PDFKit), 15 (Roadmap Phase 4 / Milestone 5)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 *
 * Generates a deterministic, tamper-evident PDF summary report for legal and law
 * enforcement intake, containing verified case metadata, evidence ledger, chronological
 * timeline, Ed25519 cryptographic trust seal, and Indian statutory notices (BSA 2023 Sec 63).
 */

import PDFDocument from 'pdfkit';
import { PdfReportData, DossierPackagingError } from './dossierTypes.js';

/**
 * Builds a deterministic PDF evidence summary report as a Buffer.
 *
 * @param data Verified report data including caseInfo, evidence, manifest, and timeline.
 * @returns Complete binary PDF Buffer.
 */
export function generatePdfReportBuffer(data: PdfReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      if (!data || !data.caseInfo || !data.manifest) {
        throw new DossierPackagingError(
          'Missing required report data: caseInfo and manifest are mandatory.',
          'ERR_INVALID_REPORT_DATA'
        );
      }

      // Safe constructor resolving default import interop
      const DocClass = (PDFDocument as any).default || PDFDocument;
      const doc = new DocClass({
        size: 'A4',
        margin: 45,
        info: {
          Title: `VeraTrace Dossier Report - Case ${data.caseInfo.caseId}`,
          Author: 'VeraTrace Forensic Dossier Engine v1.1.1',
          Subject: `Digital Evidence Preservation Report for Case: ${data.caseInfo.title}`,
          Keywords: 'Forensics, Digital Evidence, SHA-256, Ed25519, BSA 2023 Section 63',
          CreationDate: new Date(data.caseInfo.exportTimestampUtc || Date.now()),
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(new DossierPackagingError(`PDFKit generation error: ${err.message}`, 'ERR_PDFKIT_FAILURE')));

      // Colors & Styling
      const primaryColor = '#1e293b'; // Slate 800
      const accentColor = '#0f766e';  // Teal 700
      const mutedColor = '#64748b';   // Slate 500
      const darkBorder = '#cbd5e1';   // Slate 300

      // ------------------------------------------------------------------------
      // 1. HEADER & DOCUMENT CLASSIFICATION
      // ------------------------------------------------------------------------
      doc
        .fontSize(8)
        .fillColor(mutedColor)
        .text('VERATRACE — DIGITAL EVIDENCE PRESERVATION SYSTEM  |  BSA 2023 / IT ACT COMPLIANT INTAKE', { align: 'center' })
        .moveDown(0.5);

      doc
        .fontSize(18)
        .fillColor(primaryColor)
        .text('Forensic Evidence Dossier & Summary Report', { align: 'left', underline: false })
        .moveDown(0.2);

      doc
        .fontSize(9)
        .fillColor(mutedColor)
        .text('Prepared for Official Reporting & Legal Counsel Intake  ·  Strict Chain of Custody Documentation')
        .moveDown(0.8);

      // Horizontal separator
      doc.strokeColor(accentColor).lineWidth(1.5).moveTo(45, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.8);

      // ------------------------------------------------------------------------
      // 2. CASE SNAPSHOT
      // ------------------------------------------------------------------------
      doc.fontSize(11).fillColor(primaryColor).text('1. Case Overview', { bold: true }).moveDown(0.4);

      doc.fontSize(9).fillColor(primaryColor);
      const caseY = doc.y;

      doc.text(`Case Title: `, 45, caseY, { continued: true }).fillColor(accentColor).text(data.caseInfo.title);
      doc.fillColor(primaryColor).text(`Case Identifier: `, { continued: true }).fillColor(mutedColor).text(data.caseInfo.caseId);
      doc.fillColor(primaryColor).text(`Category: `, { continued: true }).fillColor(mutedColor).text(data.caseInfo.category);
      doc.fillColor(primaryColor).text(`Export Timestamp (UTC): `, { continued: true }).fillColor(mutedColor).text(data.caseInfo.exportTimestampUtc || new Date().toISOString());

      if (data.caseInfo.summary) {
        doc.moveDown(0.3);
        doc.fillColor(primaryColor).text('Summary / Description:', { bold: true });
        doc.fillColor('#334155').text(data.caseInfo.summary, { align: 'justify' });
      }

      doc.moveDown(0.8);
      doc.strokeColor(darkBorder).lineWidth(0.5).moveTo(45, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.8);

      // ------------------------------------------------------------------------
      // 3. CRYPTOGRAPHIC TRUST SEAL & INTEGRITY SUMMARY
      // ------------------------------------------------------------------------
      doc.fontSize(11).fillColor(primaryColor).text('2. Cryptographic Integrity & Asymmetric Trust Seal', { bold: true }).moveDown(0.4);

      const seal = data.manifest.trustSeal;
      doc.fontSize(9).fillColor(primaryColor);
      doc.text(`Manifest Digital Signature: `, 45, doc.y, { continued: true }).fillColor(accentColor).text(`${seal.signatureAlgorithm} (Ed25519)`);
      doc.fillColor(primaryColor).text(`Signing Key ID: `, { continued: true }).fillColor(mutedColor).text(seal.signingKeyId);
      doc.fillColor(primaryColor).text(`Canonicalization Standard: `, { continued: true }).fillColor(mutedColor).text(seal.canonicalizationAlgorithm);
      doc.fillColor(primaryColor).text(`Manifest Content SHA-256 Digest:`);
      doc.fontSize(8).fillColor('#0284c7').text(seal.manifestContentSha256);

      doc.fontSize(8).fillColor(mutedColor);
      const sigPreview = seal.serverDigitalSignature
        ? `${seal.serverDigitalSignature.slice(0, 48)}...`
        : 'N/A';
      doc.text(`Digital Signature (truncated): ${sigPreview}`);
      doc.text('Note: Full signature and verification payload are preserved in veratrace_manifest.v1.json.');

      doc.moveDown(0.8);
      doc.strokeColor(darkBorder).lineWidth(0.5).moveTo(45, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.8);

      // ------------------------------------------------------------------------
      // 4. PRESERVED EVIDENCE LEDGER
      // ------------------------------------------------------------------------
      doc.fontSize(11).fillColor(primaryColor).text(`3. Preserved Evidence Ledger (${data.evidence.length} Items)`, { bold: true }).moveDown(0.4);

      if (data.evidence.length === 0) {
        doc.fontSize(9).fillColor(mutedColor).text('No evidence files registered in this case.');
      } else {
        doc.fontSize(8).fillColor(primaryColor);

        data.evidence.forEach((ev, idx) => {
          // Check page break headroom
          if (doc.y > 680) {
            doc.addPage();
          }

          doc.fillColor(primaryColor).text(`${idx + 1}. ${ev.originalFilename}`, { bold: true });
          doc.fillColor(mutedColor).text(`   Evidence ID: ${ev.evidenceId}`);
          doc.text(`   MIME Type: ${ev.mediaType}  |  File Size: ${formatBytes(ev.fileSizeBytes)} (${ev.fileSizeBytes} bytes)`);
          doc.text(`   Intake Receipt (UTC): ${ev.systemReceiptUtc || 'Recorded'}`);
          doc.text(`   Package Relative Path: ${ev.packageRelativePath}`);
          doc.fillColor('#0369a1').text(`   SHA-256 Fingerprint: ${ev.sha256}`);
          doc.moveDown(0.4);
        });
      }

      doc.moveDown(0.6);
      doc.strokeColor(darkBorder).lineWidth(0.5).moveTo(45, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.8);

      // ------------------------------------------------------------------------
      // 5. INCIDENT TIMELINE
      // ------------------------------------------------------------------------
      const timelineEvents = data.timelineEvents || [];
      if (doc.y > 660) {
        doc.addPage();
      }

      doc.fontSize(11).fillColor(primaryColor).text(`4. Chronological Incident Timeline (${timelineEvents.length} Events)`, { bold: true }).moveDown(0.4);

      if (timelineEvents.length === 0) {
        doc.fontSize(9).fillColor(mutedColor).text('No chronological timeline events recorded.');
      } else {
        timelineEvents.forEach((event, idx) => {
          if (doc.y > 690) {
            doc.addPage();
          }

          const occurred = event.occurredAt || (event as any).occurredAtUtc || 'Uncertain date';
          const tier = event.timestampTier || (event as any).tier || 'TIER_3_USER_CLAIM';
          const uncertaintyNote = event.isTimeUncertain || event.timeConfidence === 'uncertain' || (event as any).isUncertain ? ' [TIME UNCERTAIN]' : '';
          const label = event.label || (event as any).title || 'Incident Event';

          doc.fontSize(8).fillColor(primaryColor).text(`[${occurred}] ${label}${uncertaintyNote}`, { bold: true });
          if ((event as any).description) {
            doc.fillColor('#475569').text(`   ${(event as any).description}`);
          }
          doc.fillColor(mutedColor).text(`   Timestamp Taxonomy: ${tier}`);
          doc.moveDown(0.3);
        });
      }

      doc.moveDown(0.6);
      doc.strokeColor(darkBorder).lineWidth(0.5).moveTo(45, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.8);

      // ------------------------------------------------------------------------
      // 6. PROVENANCE & AUDIT LOG PERSISTENCE DISCLOSURE
      // ------------------------------------------------------------------------
      if (doc.y > 670) {
        doc.addPage();
      }

      doc.fontSize(11).fillColor(primaryColor).text('5. Provenance & Audit Log Disclosure', { bold: true }).moveDown(0.4);
      doc.fontSize(8).fillColor(mutedColor);
      const provMeta = data.provenanceMetadata;
      if (provMeta) {
        doc.text(`Persistence Model: ${provMeta.persistenceModel}`);
        doc.text(`Durable Database Storage: ${provMeta.durableStorage ? 'ACTIVE' : 'IN_MEMORY_ONLY'}`);
        doc.text(`Total Audit Processing Events Bundled: ${provMeta.auditEventCount}`);
        doc.moveDown(0.2);
        doc.fillColor('#b45309').text(`Notice: ${provMeta.persistenceNotice}`);
      } else {
        doc.text('Provenance logs bundled in audit/processing_events.json.');
      }

      doc.moveDown(0.8);
      doc.strokeColor(darkBorder).lineWidth(0.5).moveTo(45, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.8);

      // ------------------------------------------------------------------------
      // 7. STATUTORY DISCLAIMERS & INDIAN LEGAL COMPLIANCE NOTICE
      // ------------------------------------------------------------------------
      if (doc.y > 650) {
        doc.addPage();
      }

      doc.fontSize(11).fillColor(primaryColor).text('6. Legal Notice & Forensic Disclaimers', { bold: true }).moveDown(0.4);

      const disclaimers = [
        '1. Intake Preservation Only: SHA-256 digests verify exact byte preservation from the timestamp of system intake. They do not attest to the origin or historical authenticity of data prior to receipt.',
        '2. Bharatiya Sakshya Adhiniyam (BSA) 2023 Section 63: Generation of this summary report or accompanying ZIP archive does NOT constitute judicial admissibility. A Section 63 Part A/B certificate must be separately completed and attested by the lawful device custodian or a qualified forensic expert.',
        '3. No Phantom Filing: VeraTrace is a technical draft assistance and intake preservation tool. It has NOT submitted or filed this evidence with any police station, court, or government portal (including cybercrime.gov.in).',
        '4. Verification Requirement: Independent verifiers must inspect the digitally signed veratrace_manifest.v1.json using verified out-of-band public keys, and recalculate file SHA-256 digests from the preserved evidence/ directory.',
      ];

      doc.fontSize(8).fillColor('#475569');
      disclaimers.forEach((disc) => {
        doc.text(disc, { align: 'justify' }).moveDown(0.3);
      });

      // Finalize document
      doc.end();
    } catch (err: unknown) {
      reject(
        err instanceof DossierPackagingError
          ? err
          : new DossierPackagingError(`Failed to generate PDF summary report: ${err instanceof Error ? err.message : String(err)}`, 'ERR_PDF_BUILD_FAILED')
      );
    }
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
