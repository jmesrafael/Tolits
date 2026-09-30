import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DestructiveButton } from '@/components/DestructiveButton';
import { Icon } from '@/components/Icon';
import { ListSection } from '@/components/ListSection';
import { PickerField } from '@/components/PickerField';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { showToast } from '@/components/Toast';
import { strings } from '@/i18n/strings';
import { useStrings } from '@/i18n/useStrings';
import { THEME_PREFERENCES } from '@/theme/registry';
import { DataPrivacyService } from '@/services/DataPrivacyService';
import { useSettingsStore, type LanguagePreference } from '@/stores/useSettingsStore';
import { makeStyles, typeStyle } from '@/theme/styles';
import { useTheme } from '@/theme/useTheme';
import { PressableScale } from '@/components/PressableScale';

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    sectionTitle: { ...typeStyle(t.type.h2, t.text.primary), marginTop: t.space.s4, paddingHorizontal: t.space.s1 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.s3,
      minHeight: t.size.row,
      paddingHorizontal: t.space.s4,
      paddingVertical: t.space.s2,
    },
    rowLabel: { ...typeStyle(t.type.body, t.text.primary), flex: 1 },
  }),
);

const THEME_OPTIONS = THEME_PREFERENCES.map((p) => ({
  value: p,
  label: p === 'system' ? 'System default' : p === 'light' ? 'Light' : p === 'dark' ? 'Dark' : p,
}));

const LANGUAGE_OPTIONS: { value: LanguagePreference; label: string }[] = [
  { value: 'system', label: 'System default' },
  { value: 'en', label: 'English' },
  { value: 'fil', label: 'Tagalog' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'th', label: 'ภาษาไทย' },
];

/** S-30/31/33 Settings — theme (registry-driven), language, data & privacy. */
export default function SettingsRoute() {
  const styles = useStyles();
  const router = useRouter();
  const { tokens } = useTheme();
  const themePreference = useSettingsStore((s) => s.themePreference);
  const setThemePreference = useSettingsStore((s) => s.setThemePreference);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const localized = useStrings();

  const handleReset = async () => {
    setConfirmingReset(false);
    const result = await DataPrivacyService.deleteAllData();
    if (!result.ok) {
      showToast({ kind: 'error', message: result.error.message });
      return;
    }
    showToast({
      kind: 'info',
      message: result.value.filesRemoved ? localized.dataPrivacy.deleted : localized.dataPrivacy.deletedFilesRemain,
    });
    router.replace('/(tabs)');
  };

  return (
    <Screen>
      <ScreenHeader title="Settings" />

      <Text style={styles.sectionTitle}>Theme</Text>
      <PickerField
        options={THEME_OPTIONS}
        value={themePreference}
        onChange={(v) => {
          setThemePreference(v);
          showToast('Settings saved');
        }}
        placeholder="Theme"
      />
      <Text style={styles.sectionTitle}>Language</Text>
      <PickerField
        options={LANGUAGE_OPTIONS}
        value={language}
        onChange={(v) => {
          setLanguage(v);
          showToast('Settings saved');
        }}
        placeholder="Language"
      />

      <ListSection title="Preferences">
        <PressableScale
          style={styles.row}
          onPress={() => router.push('/settings/notifications')}
          accessibilityRole="button"
          accessibilityLabel={strings.notification.settings.title}>
          <Icon name="reminder" size={tokens.iconSize.listLeading} color={tokens.icon.secondary} />
          <Text style={styles.rowLabel}>{strings.notification.settings.title}</Text>
          <Icon name="chevronRight" size={tokens.iconSize.inline} color={tokens.icon.secondary} />
        </PressableScale>
        <PressableScale
          style={styles.row}
          onPress={() => router.push('/settings/help')}
          accessibilityRole="button"
          accessibilityLabel={strings.help.title}>
          <Icon name="help" size={tokens.iconSize.listLeading} color={tokens.icon.secondary} />
          <Text style={styles.rowLabel}>{strings.help.title}</Text>
          <Icon name="chevronRight" size={tokens.iconSize.inline} color={tokens.icon.secondary} />
        </PressableScale>
      </ListSection>

      <Text style={styles.sectionTitle}>Data & privacy</Text>
      <DestructiveButton label="Delete all data" onPress={() => setConfirmingReset(true)} />
      <ConfirmDialog
        visible={confirmingReset}
        title="Delete all data?"
        body="Type DELETE to confirm. This permanently erases every motorcycle and record. It cannot be undone."
        confirmLabel="Delete everything"
        typedConfirmation="DELETE"
        onConfirm={() => {
          void handleReset();
        }}
        onCancel={() => setConfirmingReset(false)}
      />
    </Screen>
  );
}
