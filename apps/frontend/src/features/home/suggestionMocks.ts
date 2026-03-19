import type { SuggestionMock } from './components/SuggestionCard';
import deepFocusImage from '../../assets/suggestions/deep-focus.jpg';
import eldenRingImage from '../../assets/suggestions/elden-ring.png';
import falloutImage from '../../assets/suggestions/fallout.jpeg';

export const suggestionMocks: SuggestionMock[] = [
  {
    kind: 'morning',
    title: 'Good Morning, Jason',
    message: 'morning_brief',
  },
  {
    kind: 'focus',
    title: 'Deep Focus',
    message: 'deep_focus',
    imageUrl: deepFocusImage,
  },
  {
    kind: 'note',
    title: 'Quick Note',
    message: 'quick_note',
  },
  {
    kind: 'game',
    title: 'Elden Ring',
    message: 'elden_ring',
    imageUrl: eldenRingImage,
  },
  {
    kind: 'meeting',
    title: 'Preparation for Q3 Review',
    message: 'meeting_prep',
  },
  {
    kind: 'show',
    title: 'Fallout',
    message: 'fallout',
    imageUrl: falloutImage,
  },
] as const;
