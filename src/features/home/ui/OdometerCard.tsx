import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { SecondaryButton } from '@/components/SecondaryButton';
import { interpolate } from '@/i18n/strings';
import { useStrings } from '@/i18n/useStrings';
import { formatKm, formatMonthDay } from '@/lib/format';
import { makeStyles, typeStyle } from '@/theme/styles';
import { useTheme } from '@/theme/useTheme';

export interface OdometerCardProps {
  /** Last actual reading. */
  odometerKm: number;
  /** Date of that actual reading (null = unknown). */
  asOfIso: string | null;
  /** Live estimate for today, shown separately and labelled; null when the reading is current. */
  estimatedKm: number | null;
  estimateIsRough: boolean;
  /** No riding history yet: ask for another reading instead of showing an invented estimate. */
  needsMoreReadings: boolean;
  onUpdate: () => void;
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.s3,
    },
    iconWell: {
      width: t.size.iconWell,
      height: t.size.iconWell,
      borderRadius: t.radius.md,
      backgroundColor: t.primary.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      flex: 1,
      gap: 2,
    },
    label: typeStyle(t.type.caption, t.text.secondary, t.type.family),
    value: {
      ...typeStyle(t.type.h1, t.text.primary, t.type.family),
      fontVariant: ['tabular-nums'],
    },
    asOf: typeStyle(t.type.caption, t.text.tertiary, t.type.family),
  }),
);

export function OdometerCard({
  odometerKm,
  asOfIso,
  estimatedKm,
  estimateIsRough,
  needsMoreReadings,
  onUpdate,
}: OdometerCardProps) {
  const styles = useStyles();
  // Localized dictionary (English + locale overrides) — the static export is English-only.
  const strings = useStrings();
  const { tokens } = useTheme();

  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.iconWell}>
          <Icon name="odometer" size={tokens.iconSize.md} color={tokens.primary.text} />
        </View>
        <View style={styles.body}>
          <Text style={styles.label}>{strings.dashboard.odometer.title}</Text>
          <Text style={styles.value}>{formatKm(odometerKm)}</Text>
          <Text style={styles.asOf}>
            {asOfIso !== null
              ? interpolate(strings.dashboard.odometer.asOf, { date: formatMonthDay(asOfIso) })
              : strings.dashboard.odometer.noReading}
          </Text>
          {estimatedKm !== null ? (
            <Text style={styles.asOf}>
              {interpolate(
                estimateIsRough ? strings.dashboard.odometer.estimatedRough : strings.dashboard.odometer.estimated,
                { km: formatKm(estimatedKm) },
              )}
            </Text>
          ) : needsMoreReadings ? (
            <Text style={styles.asOf}>{strings.dashboard.odometer.needsReading}</Text>
          ) : null}
        </View>
        <SecondaryButton label={strings.dashboard.odometer.update} onPress={onUpdate} size="sm" />
      </View>
    </Card>
  );
}
