import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { IconButton } from '@/components/IconButton';
import { OdoInput } from '@/components/OdoInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SecondaryButton } from '@/components/SecondaryButton';
import { StatusPill } from '@/components/StatusPill';
import { TimelineItem } from '@/components/TimelineItem';
import { showToast } from '@/components/Toast';
import { ExpenseRepository } from '@/db/repositories/ExpenseRepository';
import { MaintenanceRepository } from '@/db/repositories/MaintenanceRepository';
import { MotorcycleRepository } from '@/db/repositories/MotorcycleRepository';
import { ScheduleRepository } from '@/db/repositories/ScheduleRepository';
import { componentIcon, componentLabel } from '@/features/maintenance/componentMeta';
import { formatRemaining } from '@/features/maintenance/remainingText';
import { formatOdometerReference, parseOdometerField } from '@/features/odometer/odometerText';
import { useToday } from '@/hooks/useToday';
import { strings } from '@/i18n/strings';
import { useStrings } from '@/i18n/useStrings';
import { formatCategoryName, formatMoney, formatMonthDay } from '@/lib/format';
import { OdometerService } from '@/services/OdometerService';
import { ScheduleService } from '@/services/ScheduleService';
import { computeScheduleStatus } from '@/services/StatusService';
import { makeStyles, typeStyle } from '@/theme/styles';
import type { ComponentType } from '@/types/enums';

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    title: typeStyle(t.type.h1, t.text.primary),
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    caption: typeStyle(t.type.caption, t.text.secondary),
    sectionTitle: { ...typeStyle(t.type.h2, t.text.primary), marginTop: t.space.s4 },
    baselineRow: { flexDirection: 'row', gap: t.space.s2, alignItems: 'flex-end' },
  }),
);

/** S-11 Component detail — status, interval config, baseline, and history. */
export default function ComponentDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const styles = useStyles();
  const [baselineOdo, setBaselineOdo] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const schedule = ScheduleRepository.getById(id);
  const bike = schedule !== undefined ? MotorcycleRepository.getById(schedule.motorcycleId) : undefined;

  // Last actual reading + live estimate — the same current mileage the dashboard uses.
  const today = useToday(); // re-renders at midnight so the estimate follows the date
  const localized = useStrings();
  const odometer = bike !== undefined ? OdometerService.getSnapshot(bike.id, today) : null;

  const status = useMemo(() => {
    if (schedule === undefined || bike === undefined) {
      return null;
    }
    return computeScheduleStatus(schedule, odometer?.statusKm ?? bike.currentOdometerKm, today);
  }, [schedule, bike, odometer, today, refreshKey]);

  const records = useMemo(
    () => (schedule !== undefined ? MaintenanceRepository.listByBike(schedule.motorcycleId, { scheduleId: id, limit: 20 }) : []),
    [schedule, id, refreshKey],
  );

  const totalSpent = useMemo(
    () => (schedule !== undefined ? MaintenanceRepository.totalCostForSchedule(id) : 0),
    [schedule, id, refreshKey],
  );

  const expenses = useMemo(
    () => (schedule !== undefined ? ExpenseRepository.listBySchedule(id) : []),
    [schedule, id, refreshKey],
  );

  if (schedule === undefined || bike === undefined || status === null) {
    return (
      <Screen>
        <ScreenHeader title="Not found" />
      </Screen>
    );
  }

  const componentType = schedule.componentType as ComponentType;
  const label = componentLabel(componentType, schedule.customName);

  // "When was this last done?" — only the entered mileage is known; the date is
  // left unknown rather than stamped as today.
  const handleBaseline = () => {
    const enteredKm = parseOdometerField(baselineOdo);
    if (enteredKm === null) {
      showToast({ kind: 'info', message: localized.baseline.needsKm });
      return;
    }
    const result = ScheduleService.setBaseline({
      scheduleId: id,
      lastDoneOdometerKm: enteredKm,
      lastDoneDate: null,
    });
    if (result.ok) {
      setRefreshKey((k) => k + 1);
      showToast('Baseline saved');
    }
  };

  // Today's date is known; mileage only if the user typed today's reading (never the stale cache).
  const handleServicedToday = () => {
    const result = ScheduleService.markServicedToday(id, today, parseOdometerField(baselineOdo));
    if (result.ok) {
      setRefreshKey((k) => k + 1);
      showToast('Baseline saved');
    } else {
      showToast({ kind: 'error', message: result.error.message });
    }
  };

  const togglePinned = () => {
    const result = ScheduleService.setPinned(id, schedule.isPinned !== 1);
    if (result.ok) {
      setRefreshKey((k) => k + 1);
      showToast(schedule.isPinned === 1 ? 'Removed from Quick Logs' : 'Added to Quick Logs');
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title={label}
        trailing={
          <IconButton
            icon={schedule.isPinned === 1 ? 'checkCircle' : 'plus'}
            variant={schedule.isPinned === 1 ? 'accent' : 'surface'}
            accessibilityLabel={schedule.isPinned === 1 ? 'Remove from Quick Logs' : 'Add to Quick Logs'}
            onPress={togglePinned}
          />
        }
      />
      <Card>
        <View style={styles.row}>
          <StatusPill status={status.status} label={strings.dashboard.nextMaintenance.due[status.status]} />
          <Text style={styles.caption}>{formatRemaining(status, odometer?.statusIsEstimate ?? false)}</Text>
        </View>
        <Text style={styles.caption}>
          Interval: {schedule.intervalKm !== null ? `${schedule.intervalKm} km` : ''}
          {schedule.intervalKm !== null && schedule.intervalMonths !== null ? ' / ' : ''}
          {schedule.intervalMonths !== null ? `${schedule.intervalMonths} mo` : ''}
        </Text>
      </Card>

      {status.anchored === false ? (
        <Card>
          <Text style={styles.caption}>{localized.baseline.notSetUp}</Text>
          <Text style={styles.caption}>{formatOdometerReference(odometer, localized)}</Text>
          <View style={styles.baselineRow}>
            <OdoInput value={baselineOdo} onChange={setBaselineOdo} />
            <PrimaryButton label="Save baseline" onPress={handleBaseline} />
          </View>
          <SecondaryButton label="Just serviced today" onPress={handleServicedToday} />
        </Card>
      ) : null}

      <View style={styles.row}>
        <Text style={styles.sectionTitle}>Total spent</Text>
        <Text style={styles.caption}>{formatMoney(totalSpent)}</Text>
      </View>

      <PrimaryButton
        label="Log this component"
        onPress={() => router.push(`/maintenance/log?scheduleId=${id}`)}
      />
      <SecondaryButton label="Edit interval" onPress={() => router.push(`/maintenance/schedule/${id}`)} />

      <Text style={styles.sectionTitle}>History</Text>
      {records.map((record) => (
        <TimelineItem
          key={record.id}
          icon={componentIcon(componentType)}
          title={label}
          caption={
            record.odometerKm !== null
              ? `${formatMonthDay(record.performedDate)} · ${record.odometerKm.toLocaleString('en-PH')} km`
              : formatMonthDay(record.performedDate)
          }
          amount={record.costCentavos !== null ? formatMoney(record.costCentavos) : '-'}
          onPress={() => router.push(`/maintenance/log?recordId=${record.id}`)}
        />
      ))}

      <View style={styles.row}>
        <Text style={styles.sectionTitle}>Expense logs</Text>
        <IconButton
          icon="plus"
          variant="surface"
          accessibilityLabel="Add expense for this component"
          onPress={() => router.push(`/expense/log?scheduleId=${id}` as never)}
        />
      </View>
      {expenses.length === 0 ? (
        <Text style={styles.caption}>No expenses logged for this component yet.</Text>
      ) : (
        expenses.map((expense) => (
          <TimelineItem
            key={expense.id}
            icon={componentIcon(componentType)}
            title={formatCategoryName(expense.category)}
            caption={formatMonthDay(expense.expenseDate)}
            amount={formatMoney(expense.amountCentavos)}
            onPress={() => router.push(`/expense/log?expenseId=${expense.id}` as never)}
          />
        ))
      )}
    </Screen>
  );
}
