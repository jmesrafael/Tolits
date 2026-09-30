import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { componentIcon, componentLabel } from '@/features/maintenance/componentMeta';
import { useSchedules } from '@/features/maintenance/hooks/useSchedules';
import { formatQuickLogDue } from '@/features/maintenance/quickLogText';
import { MaintenanceRepository } from '@/db/repositories/MaintenanceRepository';
import { strings } from '@/i18n/strings';
import { makeStyles, typeStyle } from '@/theme/styles';
import type { ComponentType } from '@/types/enums';
import { QuickLogCard } from './QuickLogCard';

export interface QuickLogsSectionProps {
  bikeId: string;
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    section: { gap: t.space.s2 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.space.s1,
    },
    title: typeStyle(t.type.h2, t.text.primary, t.type.family),
    scroll: { gap: t.space.s3, paddingRight: t.space.s1 },
  }),
);

/**
 * Dashboard "Quick Logs" (item 11): user-curated components pinned for a
 * glance without opening Maintenance. Built entirely on the existing
 * schedule/status pipeline (useSchedules -> StatusService) plus the new
 * is_pinned/pinned_sort_order columns, so logging a service anywhere in the
 * app resets these cards' countdown for free (ScheduleService already
 * re-anchors on every record save/edit/delete).
 */
export function QuickLogsSection({ bikeId }: QuickLogsSectionProps) {
  const styles = useStyles();
  const router = useRouter();
  // Same snapshot-derived estimate flag as the dashboard/maintenance screens.
  const { items, odometer, today } = useSchedules(bikeId);
  const kmIsEstimate = odometer?.statusIsEstimate ?? false;
  const pinned = items
    .filter((i) => i.schedule.isPinned === 1)
    .sort((a, b) => a.schedule.pinnedSortOrder - b.schedule.pinnedSortOrder);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Quick Logs
        </Text>
        <IconButton
          icon={pinned.length === 0 ? 'plus' : 'settings'}
          variant="ghost"
          accessibilityLabel="Edit Quick Logs"
          onPress={() => router.push('/maintenance/quick-logs' as never)}
        />
      </View>
      {pinned.length === 0 ? (
        <EmptyState
          icon="maintenance"
          title="Add your first Quick Log card"
          body="Pin a component like Change Oil or Chain to check on it without leaving the dashboard."
          ctaLabel="Add a card"
          onCtaPress={() => router.push('/maintenance/quick-logs' as never)}
        />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {pinned.map(({ schedule, status }) => {
            const componentType = schedule.componentType as ComponentType;
            const latest = MaintenanceRepository.latestForSchedule(schedule.id);
            return (
              <QuickLogCard
                key={schedule.id}
                icon={componentIcon(componentType)}
                label={componentLabel(componentType, schedule.customName)}
                lastDate={latest?.performedDate ?? null}
                lastOdometerKm={latest?.odometerKm ?? null}
                dueText={formatQuickLogDue(status, kmIsEstimate, today)}
                status={status.status}
                statusLabel={strings.dashboard.nextMaintenance.due[status.status]}
                onPress={() => router.push(`/maintenance/component/${schedule.id}`)}
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
