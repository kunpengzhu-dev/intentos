import type { IntentSuggestionDTO } from '../dto/suggestion.js';

export type SuggestionListPayload = Record<string, never>;

export type SuggestionListOkPayload = {
  suggestions: IntentSuggestionDTO[];
};
