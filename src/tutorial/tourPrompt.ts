import type { TutorialProgressState } from './progress';

/**
 * Whether the dashboard should offer the main tour, offer to resume it, or stay
 * quiet — pure, so the "never force existing users through it again" rules are
 * testable. Rules: only after the welcome flow, with a bike, nothing running,
 * at most once per app session; the first-run offer only while the user has
 * never answered it; Resume only for a tour left partway through under the
 * CURRENT config version (an older version's step index no longer applies).
 */
export interface TourPromptInput {
  progress: TutorialProgressState;
  hydrated: boolean;
  phase: string;
  hasBike: boolean;
  promptedThisSession: boolean;
  tourId: string;
  tourVersion: number;
}

export function decideTourPrompt(input: TourPromptInput): 'offer' | 'resume' | null {
  const { progress, hydrated, phase, hasBike, promptedThisSession, tourId, tourVersion } = input;
  if (promptedThisSession || !hydrated || phase !== 'idle' || !hasBike) {
    return null;
  }
  if (progress.welcome !== 'completed') {
    return null;
  }
  if (progress.tourOffer === 'unseen') {
    return 'offer';
  }
  const record = progress.tutorials[tourId];
  const resumable =
    record?.status === 'in_progress' && record.stepIndex > 0 && record.version === tourVersion;
  return resumable ? 'resume' : null;
}
