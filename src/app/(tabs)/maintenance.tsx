import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { ScheduleRow } from '@/components/ScheduleRow';
import { Screen } from '@/components/Screen';
import { SecondaryButton } from '@/components/SecondaryButton';
import { TextField } from '@/components/TextField';
import { componentIcon, componentLabel } from '@/features/maintenance/componentMeta';
import { useSchedules } from '@/features/maintenance/hooks/useSchedules';
import { formatRemaining } from '@/features/maintenance/remainingText';
import { useActiveBike } from '@/hooks/useActiveBike';
import { strings } from '@/i18n/strings';
import { normalizeForCompare } from '@/lib/format';
import { makeStyles, typeStyle } from '@/theme/styles';
import { TutorialAnchor } from '@/tutorial/ui/TutorialAnchor';
import type { ComponentType } from '@/types/enums';

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    title: typeStyle(t.type.h1, t.text.primary),
    summary: typeStyle(t.type.caption, t.text.secondary),
    sectionTitle: { ...typeStyle(t.type.h2, t.text.primary), marginTop: t.space.s4 },
    listAnchor: { gap: t.space.s4 },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, marginTop: t.space.s3 },
    searchInput: { flex: 1 },
  }),
);

/** S-10 Maintenance overview — all components' status for the active bike (R-04). */
export default function MaintenanceRoute() {
  const styles = useStyles();
  const router = useRouter();
  const { activeBike } = useActiveBike();
  const { items, odometer } = useSchedules(activeBike?.id ?? null);
  const kmIsEstimate = odometer?.statusIsEstimate ?? false;
  const [query, setQuery] = useState('');

  if (activeBike === null) {
    return (
      <Screen scroll={false} withTabBarInset>
        <EmptyState icon="maintenance" title="No motorcycle yet" body="Add a motorcycle to track its maintenance." />
      </Screen>
    );
  }

  const normalizedQuery = normalizeForCompare(query);
  const matches = (i: (typeof items)[number]) =>
    normalizedQuery === '' ||
    normalizeForCompare(componentLabel(i.schedule.componentType as ComponentType, i.schedule.customName)).includes(
      normalizedQuery,
    );

  const enabled = items.filter((i) => i.schedule.isEnabled === 1 && matches(i));
  const disabled = items.filter((i) => i.schedule.isEnabled === 0 && matches(i));
  const sorted = [...enabled].sort((a, b) => (b.status.ratio ?? -1) - (a.status.ratio ?? -1));
  const overdueCount = items.filter((i) => i.schedule.isEnabled === 1 && i.status.status === 'overdue').length;
  const dueSoonCount = items.filter((i) => i.schedule.isEnabled === 1 && i.status.status === 'dueSoon').length;

  return (
    <Screen tutorialScrollId="maintenance" withTabBarInset>
      <Text style={styles.title}>Maintenance</Text>
      <Text style={styles.summary}>
        {overdueCount} overdue · {dueSoonCount} due soon
      </Text>
      <View style={styles.searchRow}>
        <TextField
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search components"
          returnKeyType="search"
        />
        <IconButton
          icon="plus"
          variant="accent"
          accessibilityLabel="Custom components"
          onPress={() => router.push('/maintenance/custom')}
        />
      </View>
      {normalizedQuery !== '' && enabled.length === 0 && disabled.length === 0 ? (
        <EmptyState
          icon="search"
          title="No matching components"
          body={`Nothing matches "${query}". Try a different search, or add it as a custom component.`}
          ctaLabel="Add custom component"
          onCtaPress={() => router.push('/maintenance/custom')}
        />
      ) : null}
      <TutorialAnchor id="maintenance.list" style={styles.listAnchor}>
        {sorted.slice(0, 4).map((item) => {
          const componentType = item.schedule.componentType as ComponentType;
          return (
            <ScheduleRow
              key={item.schedule.id}
              icon={componentIcon(componentType)}
              label={componentLabel(componentType, item.schedule.customName)}
              status={item.status.status}
              statusLabel={strings.dashboard.nextMaintenance.due[item.status.status]}
              remainingText={formatRemaining(item.status, kmIsEstimate)}
              onPress={() => router.push(`/maintenance/component/${item.schedule.id}`)}
            />
          );
        })}
      </TutorialAnchor>
      {sorted.slice(4).map((item) => {
        const componentType = item.schedule.componentType as ComponentType;
        return (
          <ScheduleRow
            key={item.schedule.id}
            icon={componentIcon(componentType)}
            label={componentLabel(componentType, item.schedule.customName)}
            status={item.status.status}
            statusLabel={strings.dashboard.nextMaintenance.due[item.status.status]}
            remainingText={formatRemaining(item.status, kmIsEstimate)}
            onPress={() => router.push(`/maintenance/component/${item.schedule.id}`)}
          />
        );
      })}
      {disabled.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Disabled</Text>
          {disabled.map((item) => {
            const componentType = item.schedule.componentType as ComponentType;
            return (
              <ScheduleRow
                key={item.schedule.id}
                icon={componentIcon(componentType)}
                label={componentLabel(componentType, item.schedule.customName)}
                status="neutral"
                statusLabel="Disabled"
                remainingText=""
                onPress={() => router.push(`/maintenance/component/${item.schedule.id}`)}
              />
            );
          })}
        </>
      ) : null}
      <SecondaryButton label="History" onPress={() => router.push('/maintenance/history')} />
      <View />
    </Screen>
  );
}
