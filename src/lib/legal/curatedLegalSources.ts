/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module K: Curated Legal Source Library & Statutory Provenance
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 1.2, 8.1, 12 (Curated Legal Sources & Section 63 Documentation Metadata),
 *           15 (Phase 5: Legal Knowledge & Milestone 6)
 *
 * Curated statutory materials with verifiable legislative provenance.
 */

export interface StatutoryProvision {
  statuteCode: 'BSA_2023' | 'IT_ACT_2000' | 'BNS_2023';
  actTitle: string;
  actNumber: string;
  enactmentDate: string;
  effectiveDate: string;
  sectionNumber: string;
  heading: string;
  subsections?: string[];
  keyAdmissibilityRules?: string[];
  officialUrl: string;
}

export const CURATED_STATUTORY_SOURCES: Record<string, StatutoryProvision> = Object.freeze({
  'BSA_2023_SEC_63': {
    statuteCode: 'BSA_2023',
    actTitle: 'The Bharatiya Sakshya Adhiniyam, 2023',
    actNumber: 'Act No. 47 of 2023',
    enactmentDate: '2023-12-25',
    effectiveDate: '2024-07-01',
    sectionNumber: 'Section 63',
    heading: 'Admissibility of electronic records',
    subsections: [
      '63(1): Electronic records deemed documents without production of original.',
      '63(2)(a): Computer regular operation during material period.',
      '63(2)(b): Information regularly fed into computer in ordinary activities.',
      '63(2)(c): Computer operating properly without affecting accuracy.',
      '63(2)(d): Accurate reproduction of information.',
      '63(4): Mandatory certificate signed by person in charge of computer and an expert.',
    ],
    keyAdmissibilityRules: [
      'Mandatory certificate in the Form specified in the Schedule is required for electronic record admissibility.',
      'Certificate must deal with conditions in subsection (2) to the best knowledge and belief of the certifier.',
      'Certificate contains two distinct parts: Part A (Party) and Part B (Expert).',
    ],
    officialUrl: 'https://www.indiacode.nic.in/handle/123456789/21727',
  },
  'BSA_2023_SCHEDULE': {
    statuteCode: 'BSA_2023',
    actTitle: 'The Bharatiya Sakshya Adhiniyam, 2023',
    actNumber: 'Act No. 47 of 2023',
    enactmentDate: '2023-12-25',
    effectiveDate: '2024-07-01',
    sectionNumber: 'The Schedule [See section 63(4)]',
    heading: 'Certificate for Electronic Records (Form of Certificate)',
    subsections: [
      'PART A: Certificate to be filled by the Party (lawful custodian/operator of device).',
      'PART B: Certificate to be filled by the Expert (technical/forensic examiner).',
    ],
    keyAdmissibilityRules: [
      'Part A requires declaration of personal device custody, regular use, and absence of tampering.',
      'Part B addresses hash integrity, forensic extraction tools, and expert examination under Section 79A IT Act.',
    ],
    officialUrl: 'https://www.indiacode.nic.in/handle/123456789/21727',
  },
  'IT_ACT_2000_SEC_66E': {
    statuteCode: 'IT_ACT_2000',
    actTitle: 'The Information Technology Act, 2000',
    actNumber: 'Act No. 21 of 2000',
    enactmentDate: '2000-06-09',
    effectiveDate: '2000-10-17',
    sectionNumber: 'Section 66E',
    heading: 'Punishment for violation of privacy (capture/publish image of private area)',
    officialUrl: 'https://www.indiacode.nic.in/handle/123456789/1999',
  },
  'IT_ACT_2000_SEC_67': {
    statuteCode: 'IT_ACT_2000',
    actTitle: 'The Information Technology Act, 2000',
    actNumber: 'Act No. 21 of 2000',
    enactmentDate: '2000-06-09',
    effectiveDate: '2000-10-17',
    sectionNumber: 'Section 67',
    heading: 'Punishment for publishing or transmitting obscene material in electronic form',
    officialUrl: 'https://www.indiacode.nic.in/handle/123456789/1999',
  },
  'IT_ACT_2000_SEC_67A': {
    statuteCode: 'IT_ACT_2000',
    actTitle: 'The Information Technology Act, 2000',
    actNumber: 'Act No. 21 of 2000',
    enactmentDate: '2000-06-09',
    effectiveDate: '2000-10-17',
    sectionNumber: 'Section 67A',
    heading: 'Punishment for publishing or transmitting of material containing sexually explicit act, etc., in electronic form',
    officialUrl: 'https://www.indiacode.nic.in/handle/123456789/1999',
  },
  'BNS_2023_SEC_78': {
    statuteCode: 'BNS_2023',
    actTitle: 'The Bharatiya Nyaya Sanhita, 2023',
    actNumber: 'Act No. 45 of 2023',
    enactmentDate: '2023-12-25',
    effectiveDate: '2024-07-01',
    sectionNumber: 'Section 78',
    heading: 'Stalking (including electronic monitoring of email, internet, or electronic communication)',
    officialUrl: 'https://www.indiacode.nic.in/handle/123456789/21725',
  },
  'BNS_2023_SEC_79': {
    statuteCode: 'BNS_2023',
    actTitle: 'The Bharatiya Nyaya Sanhita, 2023',
    actNumber: 'Act No. 45 of 2023',
    enactmentDate: '2023-12-25',
    effectiveDate: '2024-07-01',
    sectionNumber: 'Section 79',
    heading: 'Word, gesture or act intended to insult modesty of a woman (including electronic intruding on privacy)',
    officialUrl: 'https://www.indiacode.nic.in/handle/123456789/21725',
  },
});
