import { useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { AppHeader } from '@/components/AppHeader';
import { EmptyState } from '@/components/EmptyState';
import { ListSection } from '@/components/ListSection';
import { ScheduleRow } from '@/components/ScheduleRow';
import { Screen } from '@/components/Screen';
import { TimelineItem } from '@/components/TimelineItem';
import { useToday } from '@/hooks/useToday';
import { useReminderStore } from '@/stores/useReminderStore';
import { strings } from '@/i18n/strings';
import { formatKm, formatMoney, formatMonthDay } from '@/lib/format';
import { TutorialAnchor } from '@/tutorial/ui/TutorialAnchor';
import { ResumeDialog, TourOfferDialog } from '@/tutorial/ui/TutorialDialogs';
import type { ActivityVm } from '@/types/domain';
import { useDashboardData } from '../hooks/useDashboardData';
import { useTourOffer } from '../hooks/useTourOffer';
import { DocumentWarningBanner } from './DocumentWarningBanner';
import { GreetingBlock } from './GreetingBlock';
import { HealthHero } from './HealthHero';
import { MonthlyStatsCard } from './MonthlyStatsCard';
import { OdometerCard } from './OdometerCard';
import { QuickActionsGrid } from './QuickActionsGrid';
import { QuickLogsSection } from './QuickLogsSection';
import { ThemeCycleButton } from './ThemeCycleButton';

function activityCaption(entry: ActivityVm): string {
  const date = formatMonthDay(entry.dateIso);
  return entry.odometerKm === undefined ? date : `${date} · ${formatKm(entry.odometerKm)}`;
}

/** S-04 Dashboard (SCREEN_SPECIFICATIONS.md) over live repository-backed data. */
export function DashboardScreen() {
  const router = useRouter();
  const vm = useDashboardData();
  const reminderCount = useReminderStore((s) => s.items.length);
  const reminderStatus = useReminderStore((s) => s.status);
  const loadReminders = useReminderStore((s) => s.load);
  const reminderDay = useReminderStore((s) => s.day);
  const today = useToday();
  const tourOffer = useTourOffer(vm.hasBike);

  useEffect(() => {
    if (reminderStatus === 'idle' || reminderDay !== today) {
      loadReminders(today);
    }
  }, [reminderStatus, reminderDay, today, loadReminders]);

  const goGarage = useCallback(() => router.push('/garage'), [router]);
  const goReminders = useCallback(() => router.push('/reminders'), [router]);
  const goMaintenance = useCallback(() => router.push('/(tabs)/maintenance'), [router]);
  const goOdometer = useCallback(() => router.push('/odometer'), [router]);
  const goMoney = useCallback(() => router.push('/(tabs)/money'), [router]);

  if (!vm.hasBike || vm.data === null) {
    return (
      <Screen scroll={false} withTabBarInset>
        <EmptyState
          icon="motorcycle"
          title="Add your first motorcycle"
          body="Tolits tracks maintenance, fuel, and expenses per bike. Add one to get started."
          ctaLabel="Add motorcycle"
          onCtaPress={() => router.push('/bike/new')}
        />
      </Screen>
    );
  }

  const { bike } = vm.data;

  return (
    <Screen tutorialScrollId="dashboard" withTabBarInset>
      <AppHeader
        bikeLabel={bike.nickname}
        bikeA11yLabel={`${bike.nickname}, ${bike.brand} ${bike.model}. ${strings.dashboard.bikeChipA11y}`}
        onBikePress={goGarage}
        reminderCount={reminderCount}
        remindersA11yLabel={strings.dashboard.remindersA11y}
        onRemindersPress={goReminders}
        trailing={<ThemeCycleButton />}
        bikeChipAnchorId="dashboard.bikeChip"
      />
      <GreetingBlock greeting={vm.greeting} dateLabel={vm.dateLabel} />
      <TutorialAnchor id="dashboard.healthHero">
        <HealthHero
          score={vm.data.healthScore}
          bandId={vm.bandId}
          bandLabel={vm.bandLabel}
          isEstimated={vm.data.isEstimatedScore}
          onPress={goMaintenance}
        />
      </TutorialAnchor>
      <TutorialAnchor id="dashboard.odometerCard">
        <OdometerCard
          odometerKm={bike.odometerKm}
          asOfIso={bike.odometerAsOf}
          estimatedKm={bike.estimatedOdometerKm}
          estimateIsRough={bike.estimateIsRough}
          needsMoreReadings={bike.needsMoreReadings}
          onUpdate={goOdometer}
        />
      </TutorialAnchor>
      {vm.data.documentWarning !== undefined ? (
        <DocumentWarningBanner
          message={vm.data.documentWarning.message}
          onPress={() => router.push('/documents')}
        />
      ) : null}
      <QuickLogsSection bikeId={bike.id} />
      <TutorialAnchor id="dashboard.nextMaintenance">
        <ListSection title={strings.dashboard.nextMaintenance.title}>
          {vm.data.upcoming.length === 0 ? null : (
            vm.data.upcoming.map((schedule) => (
              <ScheduleRow
                key={schedule.id}
                icon={schedule.icon}
                label={schedule.label}
                status={schedule.status}
                statusLabel={strings.dashboard.nextMaintenance.due[schedule.status]}
                remainingText={schedule.remainingText}
                onPress={() => router.push(`/maintenance/component/${schedule.id}`)}
              />
            ))
          )}
        </ListSection>
      </TutorialAnchor>
      <TutorialAnchor id="dashboard.quickActions">
        <QuickActionsGrid
          onAction={(actionId) => {
            if (actionId === 'log-service') {
              router.push('/maintenance/log');
            } else if (actionId === 'add-fuel') {
              router.push('/fuel/log');
            } else if (actionId === 'add-expense') {
              router.push('/expense/log');
            } else {
              goOdometer();
            }
          }}
        />
      </TutorialAnchor>
      <ListSection title={strings.dashboard.activity.title}>
        {vm.data.activity.map((entry) => (
          <TimelineItem
            key={entry.id}
            icon={entry.icon}
            title={entry.title}
            caption={activityCaption(entry)}
            amount={formatMoney(entry.amountCentavos)}
            isRepair={entry.kind === 'repair'}
            onPress={goMoney}
          />
        ))}
      </ListSection>
      <MonthlyStatsCard month={vm.data.month} onPress={goMoney} />
      <TourOfferDialog
        visible={tourOffer.offerVisible}
        onStart={tourOffer.onStart}
        onLater={tourOffer.onLater}
        onNever={tourOffer.onNever}
      />
      <ResumeDialog
        visible={tourOffer.resumeVisible}
        onResume={tourOffer.onResume}
        onRestart={tourOffer.onRestart}
        onDismiss={tourOffer.onDismissResume}
      />
    </Screen>
  );
}
