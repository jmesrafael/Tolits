import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScheduleRow } from '@/components/ScheduleRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SecondaryButton } from '@/components/SecondaryButton';
import { ListSkeleton } from '@/components/Skeleton';
import { showToast } from '@/components/Toast';
import { componentIcon, componentLabel } from '@/features/maintenance/componentMeta';
import { formatRemaining } from '@/features/maintenance/remainingText';
import { useToday } from '@/hooks/useToday';
import { interpolate, strings } from '@/i18n/strings';
import { useStrings } from '@/i18n/useStrings';
import { addDays } from '@/lib/dates';
import { formatMonthDay } from '@/lib/format';
import { ScheduleService } from '@/services/ScheduleService';
import { useReminderStore, type ReminderItem } from '@/stores/useReminderStore';
import { makeStyles, typeStyle } from '@/theme/styles';
import type { ComponentType } from '@/types/enums';

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    sectionTitle: { ...typeStyle(t.type.h2, t.text.primary), marginTop: t.space.s4, paddingHorizontal: t.space.s1 },
    itemGroup: { gap: t.space.s1 },
    note: { ...typeStyle(t.type.caption, t.text.tertiary), paddingHorizontal: t.space.s4 },
  }),
);

const BUCKET_LABEL: Record<ReminderItem['bucket'], string> = {
  overdue: 'Overdue',
  thisWeek: 'This week',
  later: 'Later',
};

/** S-05 Reminders list — overdue/due-soon items across all non-archived bikes, in-app only. */
export default function RemindersRoute() {
  const styles = useStyles();
  const router = useRouter();
  const items = useReminderStore((s) => s.items);
  const status = useReminderStore((s) => s.status);
  const load = useReminderStore((s) => s.load);
  const day = useReminderStore((s) => s.day);
  const today = useToday();
  const localized = useStrings();

  useEffect(() => {
    if (status === 'idle' || day !== today) {
      load(today);
    }
  }, [status, day, today, load]);

  if (status === 'idle') {
    return (
      <Screen>
        <ScreenHeader title="Reminders" />
        <ListSkeleton rows={3} />
      </Screen>
    );
  }

  if (items.length === 0) {
    return (
      <Screen scroll={false}>
        <ScreenHeader title="Reminders" />
        <EmptyState icon="checkCircle" title="All caught up" body="Nothing due right now. Come back after your next ride." />
      </Screen>
    );
  }

  const buckets: ReminderItem['bucket'][] = ['overdue', 'thisWeek', 'later'];

  return (
    <Screen>
      <ScreenHeader title="Reminders" />
      {buckets.map((bucket) => {
        const bucketItems = items.filter((i) => i.bucket === bucket);
        if (bucketItems.length === 0) {
          return null;
        }
        return (
          <>
            <Text style={styles.sectionTitle} key={`${bucket}-title`}>
              {BUCKET_LABEL[bucket]}
            </Text>
            {bucketItems.map((item) => {
              const componentType = item.schedule.componentType as ComponentType;
              return (
                <View key={item.schedule.id} style={styles.itemGroup}>
                  <ScheduleRow
                    icon={componentIcon(componentType)}
                    label={`${item.bikeNickname} · ${componentLabel(componentType, item.schedule.customName)}`}
                    status={item.bucket === 'overdue' ? 'overdue' : 'dueSoon'}
                    statusLabel={strings.dashboard.nextMaintenance.due[item.bucket === 'overdue' ? 'overdue' : 'dueSoon']}
                    remainingText={formatRemaining(item.status, item.kmIsEstimate)}
                    onPress={() => router.push(`/maintenance/log?scheduleId=${item.schedule.id}`)}
                  />
                  {item.overdueSince !== null && item.notificationsEnded ? (
                    // Nag policy (3 weekly notifications) is kept; the list says when they've stopped.
                    <Text style={styles.note}>
                      {interpolate(localized.remindersList.notificationsEnded, {
                        date: formatMonthDay(item.overdueSince),
                      })}
                    </Text>
                  ) : null}
                  {bucket !== 'overdue' ? (
                    <SecondaryButton
                      label="Snooze 1 week"
                      size="sm"
                      onPress={() => {
                        ScheduleService.snooze(item.schedule.id, addDays(today, 7));
                        load(today);
                        showToast({ kind: 'info', message: 'Snoozed for 1 week' });
                      }}
                    />
                  ) : null}
                </View>
              );
            })}
          </>
        );
      })}
    </Screen>
  );
}
