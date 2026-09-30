import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { todayIso } from '@/lib/dates';
import { subscribeToDayChange } from '@/lib/dayChange';

/**
 * Today's local calendar date ('YYYY-MM-DD'), re-rendering the caller when the
 * day changes while the screen stays open — at midnight, or on returning to the
 * app after the date moved. Date-dependent estimates (odometer projection,
 * due status) key off this. Timer and AppState listener are removed on unmount.
 */
export function useToday(): string {
  const [today, setToday] = useState(todayIso);
  const renderedDay = useRef(today);

  useEffect(() => {
    // Baseline = the day first rendered, so a change before this effect ran is still caught.
    const subscription = subscribeToDayChange(setToday, { initialDay: renderedDay.current });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        subscription.check();
      }
    });
    // The day may have changed between the first render and this effect.
    subscription.check();
    return () => {
      subscription.cancel();
      appState.remove();
    };
  }, []);

  return today;
}
