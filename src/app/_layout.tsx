import {
  DarkTheme as NavDarkTheme,
  DefaultTheme as NavDefaultTheme,
  ThemeProvider as NavThemeProvider,
} from 'expo-router';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RecoveryScreen } from '@/components/RecoveryScreen';
import { ToastHost } from '@/components/Toast';
import { initDatabase } from '@/db/client';
import {
  initNotifications,
  triggerReplan,
  wireNotificationCascade,
  wireNotificationResponses,
} from '@/services/NotificationScheduler';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useTutorialStore } from '@/stores/useTutorialStore';
import { loadBrandFonts } from '@/theme/fonts';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useTheme } from '@/theme/useTheme';
import { TutorialHost } from '@/tutorial/ui/TutorialHost';

/** Maps tokens → React Navigation theme so chrome re-themes with everything else. */
function ThemedNavigation() {
  const { tokens, base } = useTheme();
  const navBase = base === 'dark' ? NavDarkTheme : NavDefaultTheme;

  return (
    <NavThemeProvider
      value={{
        ...navBase,
        colors: {
          ...navBase.colors,
          primary: tokens.primary.base,
          background: tokens.bg.page,
          card: tokens.bg.nav,
          text: tokens.text.primary,
          border: tokens.border.divider,
          notification: tokens.feedback.error.base,
        },
      }}>
      <StatusBar style={base === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="pending" options={{ presentation: 'modal' }} />
      </Stack>
    </NavThemeProvider>
  );
}

/**
 * Startup sequence (DATA_FLOW.md §1): open DB + apply migrations, hydrate
 * settings, and register the brand font, before first navigation render.
 * Migration failure blocks with the recovery screen (ERROR_HANDLING.md §7) —
 * never a half-migrated app. Font load failure never blocks — typeStyle()
 * falls back to the platform font automatically.
 */
function useStartup() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const hydrate = useSettingsStore((s) => s.hydrate);
  const hydrateTutorial = useTutorialStore((s) => s.hydrate);

  const attempt = () => {
    setFailed(false);
    try {
      initDatabase();
      hydrate();
      hydrateTutorial();
    } catch {
      setFailed(true);
      return;
    }
    loadBrandFonts().finally(() => setReady(true));
  };

  useEffect(attempt, []);

  return { ready, failed, retry: attempt };
}

/**
 * Wires the notification re-plan cascade once the DB is ready (NOTIFICATION_ENGINE.md
 * §5, §9a): domain-event-driven re-plans plus a re-plan on every app
 * foreground, which doubles as the reboot/timezone recovery path.
 */
function useNotificationCascade(ready: boolean): void {
  useEffect(() => {
    if (!ready) {
      return;
    }
    initNotifications();
    triggerReplan();
    const offCascade = wireNotificationCascade();
    const offResponses = wireNotificationResponses((route) => router.push(route as never));
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        triggerReplan();
      }
    });
    return () => {
      offCascade();
      offResponses();
      subscription.remove();
    };
  }, [ready]);
}

function StartupGate() {
  const { ready, failed, retry } = useStartup();
  useNotificationCascade(ready);

  if (failed) {
    return <RecoveryScreen onRetry={retry} />;
  }
  if (!ready) {
    return <AppLoadingScreen />;
  }
  return (
    <ErrorBoundary>
      <ThemedNavigation />
      <TutorialHost />
      <ToastHost />
    </ErrorBoundary>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <StartupGate />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}