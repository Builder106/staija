import type { Program } from './firebase';

// Shared program-page content plumbing for the two program detail views
// (src/components/programs/StepUpDetailView.vue and DynamergeDetailView.vue).
//
// The two pages deliberately do NOT share a layout component — StepUp
// renders as a research journal, Dynamerge as a sprint — but they share
// this data layer so both keep reading the same admin-editable Firestore
// Program shape, with the same fallback-first strategy.

export type ProgramSlug = 'stepup-scholars' | 'dynamerge';

// The subset of Program the public pages render. Mirrors what the views
// consume so a Firestore doc and the local fallback are interchangeable.
export type ProgramView = {
  name: string;
  pitch: string;
  eligibility: string;
  stats: { icon: string; label: string; value: string }[];
  heroImg: string;
  features: { title: string; desc: string; img: string }[];
  timeline: { date: string; desc: string }[];
  eligibilityList: string[];
  mentors: { name: string; title: string; institution: string; img: string }[];
};

// Fallback content used while no Program doc exists in Firestore yet.
// Once an admin clicks "Create defaults" in /admin/programs, the seed
// (src/views/admin/ProgramManagement.vue, which mirrors this dict)
// writes these same values to Firestore and the program views start
// reading from there. Keeping the fallback also means a transient
// Firestore outage doesn't blank the program pages.
export const PROGRAM_FALLBACKS: Record<ProgramSlug, ProgramView> = {
  'stepup-scholars': {
    name: 'StepUp Scholars',
    pitch: 'A rigorous, Nigeria-based research incubator for high-school and gap-year students.',
    eligibility: 'Ages 15–19 | Nigeria',
    stats: [
      { icon: 'lucide:users', label: 'Cohort size', value: '30 students' },
      { icon: 'lucide:clock', label: 'Duration', value: '6 months' },
      { icon: 'lucide:banknote', label: 'Stipend', value: '₦50,000 / mo' },
    ],
    heroImg:
      'https://images.unsplash.com/photo-1625082361965-1139be607018?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    features: [
      {
        title: 'Real Research',
        desc: 'Access world-class labs and equipment. Design experiments and gather original data.',
        img: 'https://images.unsplash.com/photo-1562789278-dac7af7fb5b1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
      },
      {
        title: 'Direct Mentorship',
        desc: 'Work 1:1 with postdoctoral researchers and industry scientists from top institutions.',
        img: 'https://images.unsplash.com/photo-1658252844173-ba5de80a3015?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
      },
      {
        title: 'Lasting Community',
        desc: 'Join a tight-knit cohort of peers who will become your future collaborators.',
        img: 'https://images.unsplash.com/photo-1737529807163-1d8a3fb6c403?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
      },
    ],
    timeline: [
      { date: 'Month 1', desc: 'Research methods boot camp and lab safety certification.' },
      {
        date: 'Month 2–4',
        desc: 'Active experimentation, data gathering, and weekly mentor check-ins.',
      },
      {
        date: 'Month 5',
        desc: 'Data analysis, scientific writing workshops, and abstract drafting.',
      },
      {
        date: 'Month 6',
        desc: 'Final symposium presentation and submission to youth science journals.',
      },
    ],
    eligibilityList: [
      'Must be between 15 and 19 years old',
      'Currently enrolled in secondary school or on a gap year in Nigeria',
      'Demonstrated interest in STEM subjects',
      'Able to commit 10 hours per week for 6 months',
    ],
    mentors: [
      {
        name: 'Dr. Amina Yusuf',
        title: 'Postdoctoral Researcher',
        institution: 'MIT',
        img: 'https://images.unsplash.com/photo-1611432579699-484f7990b127?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
      },
      {
        name: 'Prof. David Okafor',
        title: 'Principal Investigator',
        institution: 'University of Lagos',
        img: 'https://images.unsplash.com/photo-1614023342667-6f060e9d1e04?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
      },
      {
        name: 'Sarah Nwachukwu',
        title: 'PhD Candidate',
        institution: 'Stanford',
        img: 'https://images.unsplash.com/photo-1618355776464-8666794d2520?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
      },
    ],
  },
  dynamerge: {
    name: 'Dynamerge',
    pitch:
      'A pan-African virtual summer bootcamp connecting ambitious students with global mentors.',
    eligibility: 'Ages 15–20 | Pan-African',
    stats: [
      { icon: 'lucide:users', label: 'Eligibility', value: 'Pan-African' },
      { icon: 'lucide:clock', label: 'Duration', value: '4 weeks' },
      { icon: 'lucide:banknote', label: 'Cost', value: 'Fully funded' },
    ],
    heroImg:
      'https://images.unsplash.com/photo-1620831468075-db24ca183258?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    features: [
      {
        title: 'Intensive Curriculum',
        desc: 'Four weeks of daily virtual workshops covering coding, data science, and leadership.',
        img: 'https://images.unsplash.com/photo-1588196749597-9ff075ee6b5b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
      },
      {
        title: 'Global Mentors',
        desc: 'Learn directly from industry experts at top tech companies and research institutes.',
        img: 'https://images.unsplash.com/photo-1766074903112-79661da9ab45?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
      },
      {
        title: 'Pan-African Network',
        desc: 'Build lasting relationships with peers across the continent.',
        img: 'https://images.unsplash.com/photo-1758270705518-b61b40527e76?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
      },
    ],
    timeline: [
      { date: 'Week 1', desc: 'Foundations: Introduction to programming and data analysis.' },
      { date: 'Week 2', desc: 'Deep Dive: specialized tracks in AI, biotech, or clean energy.' },
      { date: 'Week 3', desc: 'Project Phase: Collaborative problem solving in assigned teams.' },
      { date: 'Week 4', desc: 'Demo Day: Present solutions to a panel of expert judges.' },
    ],
    eligibilityList: [
      'Must be between 15 and 20 years old',
      'Resident of any African country',
      'Reliable internet access (data stipends available based on need)',
      'Passionate about leveraging technology for impact',
    ],
    mentors: [
      {
        name: 'Dr. Amina Yusuf',
        title: 'Postdoctoral Researcher',
        institution: 'MIT',
        img: 'https://images.unsplash.com/photo-1611432579699-484f7990b127?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
      },
      {
        name: 'Prof. David Okafor',
        title: 'Principal Investigator',
        institution: 'University of Lagos',
        img: 'https://images.unsplash.com/photo-1614023342667-6f060e9d1e04?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
      },
      {
        name: 'Sarah Nwachukwu',
        title: 'PhD Candidate',
        institution: 'Stanford',
        img: 'https://images.unsplash.com/photo-1618355776464-8666794d2520?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
      },
    ],
  },
};

export function toProgramView(p: Program): ProgramView {
  return {
    name: p.name,
    pitch: p.pitch,
    eligibility: p.eligibility,
    stats: p.stats,
    heroImg: p.heroImg,
    features: p.features,
    timeline: p.timeline,
    eligibilityList: p.eligibilityList,
    mentors: p.mentors,
  };
}
