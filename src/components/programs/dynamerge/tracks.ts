// Week-2 tracks. Copy is prototype content: editable claims only, no
// numbers; it belongs on the Program doc if the section survives review.
// `color` tints the track's dots on the continent map: brand violet,
// brand sky, and a Pan-African green lightened to read on ink.
export const TRACKS = [
  {
    name: 'Artificial Intelligence',
    icon: 'lucide:brain-circuit',
    color: '#8b55ff',
    copy: 'Go from first principles to working models, and look hard at where AI is already changing industries across the continent.',
  },
  {
    name: 'Biotech',
    icon: 'lucide:dna',
    color: '#5edbe7',
    copy: 'Explore how modern biology gets engineered, and how the same tools apply to health challenges African communities actually face.',
  },
  {
    name: 'Clean Energy',
    icon: 'lucide:zap',
    color: '#2fa36b',
    copy: 'Dig into the technologies racing to power the continent, from solar economics to storage, and prototype around a real constraint.',
  },
] as const;
