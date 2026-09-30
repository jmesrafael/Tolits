import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useTutorialStore } from '@/stores/useTutorialStore';
import { dashboardTour } from '@/tutorial/configs/dashboard';
import { startTutorial } from '@/tutorial/engine';
import { decideTourPrompt } from '@/tutorial/tourPrompt';

const DASHBOARD_TOUR_ID = dashboardTour.id;
const OFFER_DELAY_MS = 600;

/** Ask at most once per app session — "Not now" must never turn into nagging. */
let promptedThisSession = false;

export interface TourOfferState {
  offerVisible: boolean;
  resumeVisible: boolean;
  onStart: () => void;
  onLater: () => void;
  onNever: () => void;
  onResume: () => void;
  onRestart: () => void;
  onDismissResume: () => void;
}

/**
 * Dashboard tour offer + resume prompts. Fires once after onboarding resolves
 * (welcome completed, bike present, nothing else running). "Not now" leaves
 * the tour available in Settings → Help & Tutorials; "Never" suppresses the
 * offer for good; an abandoned tour gets a one-time Resume offer.
 */
export function useTourOffer(hasBike: boolean): TourOfferState {
  const [offerVisible, setOfferVisible] = useState(false);
  const [resumeVisible, setResumeVisible] = useState(false);
  const setTourOffer = useTutorialStore((s) => s.setTourOffer);

  useFocusEffect(
    useCallback(() => {
      const { progress, phase, hydrated } = useTutorialStore.getState();
      const decision = decideTourPrompt({
        progress,
        hydrated,
        phase,
        hasBike,
        promptedThisSession,
        tourId: DASHBOARD_TOUR_ID,
        tourVersion: dashboardTour.version,
      });
      if (decision === null) {
        return;
      }
      const wantsOffer = decision === 'offer';
      const timer = setTimeout(() => {
        promptedThisSession = true;
        if (wantsOffer) {
          setOfferVisible(true);
        } else {
          setResumeVisible(true);
        }
      }, OFFER_DELAY_MS);
      return () => clearTimeout(timer);
    }, [hasBike]),
  );

  return {
    offerVisible,
    resumeVisible,
    onStart: () => {
      setOfferVisible(false);
      setTourOffer('accepted');
      startTutorial(DASHBOARD_TOUR_ID);
    },
    onLater: () => {
      setOfferVisible(false);
      setTourOffer('later');
    },
    onNever: () => {
      setOfferVisible(false);
      setTourOffer('never');
    },
    onResume: () => {
      setResumeVisible(false);
      const record = useTutorialStore.getState().progress.tutorials[DASHBOARD_TOUR_ID];
      startTutorial(DASHBOARD_TOUR_ID, { resumeFrom: record?.stepIndex ?? 0 });
    },
    onRestart: () => {
      setResumeVisible(false);
      startTutorial(DASHBOARD_TOUR_ID);
    },
    onDismissResume: () => {
      // Leave the tour in_progress: Help & Tutorials still offers Resume.
      setResumeVisible(false);
    },
  };
}
