/**
 * Per-program application schemas.
 *
 * The wizard at `/apply/:program` reads from this config to render
 * program-specific fields. Adding a third program is a matter of adding
 * one entry here — no template changes.
 *
 * Skeleton (shared across programs):
 *   1. Eligibility quick-check
 *   2. Personal info
 *   3. Academic info
 *   4. Motivation + experience + references
 *   5. Files + review
 *
 * Each program can override per-step fields and copy. Required-ness is
 * enforced both client-side (UI) and server-side (Cloud Function).
 */

import { REGIONS_BY_COUNTRY, REGION_LABEL_BY_COUNTRY, WEST_AFRICAN_COUNTRIES } from './regions';

export type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'date'
  | 'url'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'tags'
  | 'number';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[]; // for select
  rows?: number; // for textarea
  pattern?: string; // regex for text/email
  /** Min / max for tags type — number of tags allowed. */
  minTags?: number;
  maxTags?: number;
  /** Minimum word count for textarea fields. Enforced on Continue. */
  minWords?: number;
  /**
   * Render an in-browser audio recorder beside the field — fully
   * optional from the applicant's perspective. Confident speakers and
   * shy writers self-select differently and you'll see better signal.
   * Uploaded as a separate file at submit time; the written field is
   * still the canonical answer.
   */
  audioOptional?: { maxSeconds: number; prompt?: string };
  /**
   * Dynamic select: options come from `map[fields[dependsOn]]` at
   * render time instead of a static `options` list. Used today by the
   * region field which keys off the chosen nationality (Nigeria →
   * states, Ghana → regions, etc.). The field's `label` is also
   * dynamic — see `labelByDependent` — so the label reads correctly
   * for whichever country is selected.
   */
  optionsBy?: {
    dependsOn: string;
    map: Record<string, string[]>;
    labelByDependent?: Record<string, string>;
  };
}

export interface StepDef {
  id: string;
  /** Short label for the step indicator chips at the top of the wizard. */
  label: string;
  /**
   * Sentence-style headline shown in the step card itself. If absent we
   * fall back to `label`, but most steps should set this — applicants
   * read "Tell us who you are." as warmer than "Personal".
   */
  headline?: string;
  description?: string;
  fields: FieldDef[];
}

export interface ProgramSchema {
  slug: 'stepup-scholars' | 'dynamerge';
  name: string;
  ageRange: string;
  scope: string;
  /** Used in confirmation emails + receipts. */
  programKey: 'stepup_scholars' | 'dynamerge';
  /** Eligibility checkboxes that gate "Continue". */
  eligibility: { id: string; label: string; required: boolean }[];
  steps: StepDef[];
  /** How many references the program asks for. */
  referenceCount: { min: number; max: number };
}

const personalInfoStep = (extras: FieldDef[] = []): StepDef => ({
  id: 'personal',
  label: 'Personal',
  headline: 'Tell us who you are.',
  description: 'The basics — name, contact, where you are.',
  fields: [
    { name: 'firstName', label: 'First name', type: 'text', required: true },
    { name: 'lastName', label: 'Last name', type: 'text', required: true },
    {
      name: 'email',
      label: 'Email',
      type: 'email',
      required: true,
      helpText: 'We use this for application updates.',
    },
    { name: 'phone', label: 'Phone', type: 'tel', required: true, placeholder: '+234…' },
    { name: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true },
    {
      name: 'nationality',
      label: 'Nationality',
      type: 'select',
      required: true,
      options: [...WEST_AFRICAN_COUNTRIES],
      helpText: 'STAIJA recruits across ECOWAS — 15 West African countries.',
    },
    {
      // Region/state-level admin division. Options + label both adapt
      // to the chosen nationality, so a Nigerian sees "State", a
      // Ghanaian sees "Region", a Liberian sees "County", etc.
      name: 'region',
      label: 'State / region',
      type: 'select',
      required: true,
      optionsBy: {
        dependsOn: 'nationality',
        map: REGIONS_BY_COUNTRY,
        labelByDependent: REGION_LABEL_BY_COUNTRY,
      },
    },
    ...extras,
  ],
});

const academicInfoStep: StepDef = {
  id: 'academic',
  label: 'Academic',
  headline: "Where you're studying.",
  description: 'School, level, and the subjects on your radar.',
  fields: [
    {
      name: 'currentInstitution',
      label: 'Current school / institution',
      type: 'text',
      required: true,
    },
    {
      name: 'currentLevel',
      label: 'Year / level',
      type: 'text',
      required: true,
      placeholder: 'SS3, gap year, undergrad year 1, etc.',
    },
    { name: 'major', label: 'Major / area of focus', type: 'text', required: false },
    {
      name: 'gpa',
      label: 'GPA / class',
      type: 'text',
      required: false,
      helpText: 'Use whatever scale your school uses.',
    },
    { name: 'graduationYear', label: 'Expected graduation year', type: 'number', required: false },
    {
      name: 'relevantCourses',
      label: 'Relevant courses',
      type: 'tags',
      helpText: 'Comma-separated. Up to 8.',
      maxTags: 8,
    },
  ],
};

const motivationStep = (researchHelp: string): StepDef => ({
  id: 'motivation',
  label: 'You',
  headline: "Why you're here.",
  description: 'The part where you tell us what you want to do, and why.',
  fields: [
    {
      name: 'researchInterests',
      label: 'Research interests',
      type: 'tags',
      required: true,
      minTags: 1,
      maxTags: 6,
      helpText: researchHelp,
    },
    {
      name: 'motivation',
      label: 'Why this program?',
      type: 'textarea',
      required: true,
      rows: 6,
      minWords: 300,
      helpText: '300–500 words. What do you want to learn, and what would you do with it?',
      audioOptional: {
        maxSeconds: 90,
        prompt:
          'Prefer to talk it out? Record a 90-second answer to the same question. The written response above is still required — this just gives us another way to hear you.',
      },
    },
    {
      name: 'experience',
      label: 'Relevant experience',
      type: 'textarea',
      required: true,
      rows: 5,
      helpText:
        'Projects, classes, science fairs, hackathons — anything that shows you can do the work.',
    },
  ],
});

export const PROGRAMS: Record<string, ProgramSchema> = {
  'stepup-scholars': {
    slug: 'stepup-scholars',
    name: 'StepUp Scholars',
    ageRange: 'Ages 15–19',
    scope: 'Nigeria | in-person | 6 months',
    programKey: 'stepup_scholars',
    eligibility: [
      { id: 'age', label: 'I am between 15 and 19 years old.', required: true },
      { id: 'nigeria', label: 'I live in Nigeria and can attend in person.', required: true },
      {
        id: 'school',
        label: 'I am currently enrolled in secondary school or on a gap year.',
        required: true,
      },
      { id: 'commit', label: 'I can commit ~10 hours per week for 6 months.', required: true },
    ],
    steps: [
      // Nationality + region now live in the shared base step (driven
      // by the ECOWAS country list), so StepUp doesn't need its own
      // Nigeria-specific state extra anymore.
      personalInfoStep(),
      academicInfoStep,
      motivationStep(
        'What scientific questions excite you? E.g. "soil microbiomes", "low-cost diagnostics".'
      ),
    ],
    referenceCount: { min: 2, max: 3 },
  },

  dynamerge: {
    slug: 'dynamerge',
    name: 'Dynamerge',
    ageRange: 'Ages 15–20',
    scope: 'Pan-African | virtual | 4 weeks',
    programKey: 'dynamerge',
    eligibility: [
      { id: 'age', label: 'I am between 15 and 20 years old.', required: true },
      { id: 'african', label: 'I am a resident of an African country.', required: true },
      {
        id: 'internet',
        label: 'I have reliable internet access (data stipends available based on need).',
        required: false,
      },
      { id: 'commit', label: 'I can commit ~15 hours per week for 4 weeks.', required: true },
    ],
    steps: [
      personalInfoStep([
        // Nationality + region now come from the shared base step, so
        // the old "country of residence" text field is redundant.
        // Timezone and connectivity self-report are still
        // Dynamerge-specific.
        {
          // Africa-only timezone shortlist. Dynamerge is for residents of
          // African countries, and the four bands below cover the whole
          // continent — narrowing the choice avoids "WAT vs WAST vs UTC+1"
          // free-text drift and gives ops a stable bucket to schedule
          // against. Diaspora / odd cases are rare enough to deal with
          // by hand if they show up.
          name: 'timezone',
          label: 'Timezone',
          type: 'select',
          required: true,
          options: [
            'GMT (UTC+0) — West Africa',
            'WAT (UTC+1) — West / Central Africa',
            'CAT (UTC+2) — Central / Southern Africa',
            'EAT (UTC+3) — East Africa',
          ],
          helpText: 'So we can schedule live sessions you can actually attend.',
        },
        {
          name: 'internetSelfReport',
          label: 'How would you describe your internet?',
          type: 'select',
          required: true,
          options: [
            'Stable broadband / fiber',
            'Reliable 4G or LTE',
            'Patchy 4G / mobile hotspot',
            '3G / data-constrained',
          ],
        },
      ]),
      academicInfoStep,
      motivationStep(
        'Pick technical areas you want to dive into. E.g. "machine learning", "biotech", "clean energy".'
      ),
    ],
    referenceCount: { min: 1, max: 2 },
  },
};

export function getProgram(slug: string): ProgramSchema | null {
  return PROGRAMS[slug] ?? null;
}
