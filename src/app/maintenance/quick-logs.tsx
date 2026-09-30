import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { DraggableList } from '@/components/DraggableList';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { componentIcon, componentLabel } from '@/features/maintenance/componentMeta';
import { useSchedules } from '@/features/maintenance/hooks/useSchedules';
import { useActiveBike } from '@/hooks/useActiveBike';
import { normalizeForCompare } from '@/lib/format';
import { ScheduleService } from '@/services/ScheduleService';
import { makeStyles, typeStyle } from '@/theme/styles';
import { useTheme } from '@/theme/useTheme';
import type { ComponentType } from '@/types/enums';

const ROW_HEIGHT = 60;

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    title: typeStyle(t.type.h1, t.text.primary),
    sectionTitle: { ...typeStyle(t.type.h2, t.text.primary), marginTop: t.space.s4 },
    caption: typeStyle(t.type.caption, t.text.secondary),
    row: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.s3,
      paddingHorizontal: t.space.s4,
    },
    iconWell: {
      width: t.size.iconWellSm,
      height: t.size.iconWellSm,
      borderRadius: t.radius.sm,
      backgroundColor: t.bg.surfaceVariant,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: { flex: 1, ...typeStyle(t.type.body, t.text.primary) },
    card: { padding: 0, marginBottom: t.space.s2 },
  }),
);

/** Dashboard "Quick Logs" management (item 11): search + pin/unpin + drag-reorder pinned cards. */
export default function QuickLogsManageRoute() {
  const styles = useStyles();
  const { tokens } = useTheme();
  const { activeBike } = useActiveBike();
  const [query, setQuery] = useState('');
  const { items } = useSchedules(activeBike?.id ?? null);
  const [refreshKey, setRefreshKey] = useState(0);
  void refreshKey;

  if (activeBike === null) {
    return (
      <Screen>
        <Text style={styles.title}>No motorcycle selected</Text>
      </Screen>
    );
  }

  const pinned = items
    .filter((i) => i.schedule.isPinned === 1)
    .sort((a, b) => a.schedule.pinnedSortOrder - b.schedule.pinnedSortOrder);

  const normalizedQuery = normalizeForCompare(query);
  const searchable = items.filter((i) => {
    if (i.schedule.isPinned === 1) {
      return false;
    }
    const label = componentLabel(i.schedule.componentType as ComponentType, i.schedule.customName);
    return normalizedQuery === '' || normalizeForCompare(label).includes(normalizedQuery);
  });

  const togglePin = (scheduleId: string, next: boolean) => {
    ScheduleService.setPinned(scheduleId, next);
    setRefreshKey((k) => k + 1);
  };

  return (
    <Screen>
      <ScreenHeader title="Quick Logs" />
      <Text style={styles.caption}>
        Pick which components show as cards on your dashboard, and drag to reorder them.
      </Text>

      <Text style={styles.sectionTitle}>Pinned</Text>
      {pinned.length === 0 ? (
        <EmptyState icon="maintenance" title="Nothing pinned yet" body="Search below and tap + to pin a component." />
      ) : (
        <DraggableList
          data={pinned}
          keyExtractor={(i) => i.schedule.id}
          itemHeight={ROW_HEIGHT}
          onReorder={(next) => {
            ScheduleService.reorderPinned(
              activeBike.id,
              next.map((i) => i.schedule.id),
            );
            setRefreshKey((k) => k + 1);
          }}
          renderItem={({ schedule }) => {
            const componentType = schedule.componentType as ComponentType;
            return (
              <Card style={styles.card}>
                <View style={[styles.row, { height: ROW_HEIGHT }]}>
                  <View style={styles.iconWell}>
                    <Icon name={componentIcon(componentType)} size={tokens.iconSize.inline} color={tokens.icon.primary} />
                  </View>
                  <Text style={styles.label} numberOfLines={1}>
                    {componentLabel(componentType, schedule.customName)}
                  </Text>
                  <IconButton
                    icon="minus"
                    variant="ghost"
                    accessibilityLabel="Remove from Quick Logs"
                    onPress={() => togglePin(schedule.id, false)}
                  />
                </View>
              </Card>
            );
          }}
        />
      )}

      <Text style={styles.sectionTitle}>All components</Text>
      <TextField value={query} onChangeText={setQuery} placeholder="Search components" returnKeyType="search" />
      {searchable.length === 0 ? (
        <Text style={styles.caption}>
          {items.length === pinned.length ? 'Every component is already pinned.' : 'No matches.'}
        </Text>
      ) : (
        searchable.map(({ schedule }) => {
          const componentType = schedule.componentType as ComponentType;
          return (
            <Card key={schedule.id} style={styles.card}>
              <PressableScale
                containerStyle={{ width: '100%' }}
                style={[styles.row, { height: ROW_HEIGHT }]}
                onPress={() => togglePin(schedule.id, true)}
                accessibilityRole="button"
                accessibilityLabel={`Pin ${componentLabel(componentType, schedule.customName)}`}>
                <View style={styles.iconWell}>
                  <Icon name={componentIcon(componentType)} size={tokens.iconSize.inline} color={tokens.icon.primary} />
                </View>
                <Text style={styles.label} numberOfLines={1}>
                  {componentLabel(componentType, schedule.customName)}
                </Text>
                <Icon name="plus" size={tokens.iconSize.inline} color={tokens.primary.text} />
              </PressableScale>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
