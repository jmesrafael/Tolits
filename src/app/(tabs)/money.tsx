import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SecondaryButton } from '@/components/SecondaryButton';
import { SegmentedControl } from '@/components/SegmentedControl';
import { StatCard } from '@/components/StatCard';
import { TimelineItem } from '@/components/TimelineItem';
import { useActiveBike } from '@/hooks/useActiveBike';
import { formatCategoryName, formatMoney, formatMonthDay } from '@/lib/format';
import { unifiedRowName } from '@/lib/expenseDisplay';
import { useMoneyStore } from '@/stores/useMoneyStore';
import { makeStyles, typeStyle } from '@/theme/styles';

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    title: typeStyle(t.type.h1, t.text.primary),
    total: {
      ...typeStyle(t.type.display, t.text.primary),
      fontVariant: ['tabular-nums'],
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
  }),
);

const SEGMENTS = [
  { value: 'expenses' as const, label: 'Expenses' },
  { value: 'fuel' as const, label: 'Fuel' },
];

/** S-22 Money tab root — Expenses/Fuel segments. */
export default function MoneyRoute() {
  const styles = useStyles();
  const router = useRouter();
  const { activeBike } = useActiveBike();
  const [segment, setSegment] = useState<'expenses' | 'fuel'>('expenses');
  const money = useMoneyStore();

  useEffect(() => {
    if (activeBike !== null) {
      money.load(activeBike.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBike?.id]);

  if (activeBike === null) {
    return (
      <Screen scroll={false} withTabBarInset>
        <EmptyState icon="expense" title="No motorcycle yet" body="Add a motorcycle to track spending." />
      </Screen>
    );
  }

  return (
    <Screen withTabBarInset>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Expense</Text>
        <SecondaryButton label="Builds" icon="garage" size="sm" onPress={() => router.push('/builds' as never)} />
      </View>
      <SegmentedControl segments={SEGMENTS} value={segment} onChange={setSegment} />
      {segment === 'expenses' ? (
        <>
          <Text style={styles.total}>{formatMoney(money.monthTotalCentavos)}</Text>
          <PrimaryButton label="+ Expense" onPress={() => router.push('/expense/log')} />
          {money.unified.map((row) => {
            const categoryName = formatCategoryName(row.category);
            const name = unifiedRowName(row);
            return (
              <TimelineItem
                key={`${row.source}-${row.id}`}
                icon={row.source === 'fuel' ? 'fuel' : row.source === 'repair' ? 'repair' : 'expense'}
                title={name}
                caption={
                  name !== categoryName ? `${formatMonthDay(row.date)} · ${categoryName}` : formatMonthDay(row.date)
                }
                detail={row.source === 'expense' && row.label !== null ? row.label : undefined}
                amount={formatMoney(row.amountCentavos)}
                isRepair={row.source === 'repair'}
                onPress={() => {
                  if (row.source === 'expense') {
                    router.push(`/expense/log?expenseId=${row.id}`);
                  } else if (row.source === 'fuel') {
                    router.push(`/fuel/log?fuelLogId=${row.id}`);
                  } else if (row.source === 'repair') {
                    router.push(`/repair/log?repairId=${row.id}`);
                  } else {
                    router.push(`/maintenance/log?recordId=${row.id}`);
                  }
                }}
              />
            );
          })}
        </>
      ) : (
        <>
          <PrimaryButton label="+ Fuel" onPress={() => router.push('/fuel/log')} />
          <StatCard
            label="Avg consumption"
            value={money.averageKmPerLiter !== null ? `${money.averageKmPerLiter.toFixed(1)} km/L` : '-'}
          />
          <StatCard
            label="Cost/km"
            value={money.fuelCostPerKmCentavos !== null ? formatMoney(money.fuelCostPerKmCentavos) : '-'}
          />
          {money.fuelLogs.map((log) => (
            <TimelineItem
              key={log.id}
              icon="fuel"
              title={log.station ?? 'Fuel'}
              caption={`${formatMonthDay(log.fuelDate)} · ${log.liters} L`}
              amount={formatMoney(log.totalCostCentavos)}
              onPress={() => router.push(`/fuel/log?fuelLogId=${log.id}`)}
            />
          ))}
        </>
      )}
    </Screen>
  );
}
