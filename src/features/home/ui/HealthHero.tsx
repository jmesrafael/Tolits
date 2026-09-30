import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { HealthRing } from '@/components/HealthRing';
import { Icon } from '@/components/Icon';
import { interpolate } from '@/i18n/strings';
import { useStrings } from '@/i18n/useStrings';
import { makeStyles, typeStyle } from '@/theme/styles';
import { useTheme } from '@/theme/useTheme';
import type { HealthBandId } from '@/types/domain';

export interface HealthHeroProps {
  score: number | null;
  bandId: HealthBandId | null;
  bandLabel: string;
  /** The score used an estimated odometer for a km-based item — say so; hidden for actual readings. */
  isEstimated: boolean;
  onPress: () => void;
}

/** Band → status-ramp tint pairing for the chip background (DESIGN_SYSTEM.md §2.2). */
const BAND_TINT: Record<HealthBandId, 'excellent' | 'good' | 'dueSoon' | 'overdue' | 'critical'> = {
  excellent: 'excellent',
  good: 'good',
  fair: 'dueSoon',
  poor: 'overdue',
  critical: 'critical',
};

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    inner: {
      alignItems: 'center',
      gap: t.space.s2,
      paddingVertical: t.space.s3,
    },
    captionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.s1,
    },
    caption: typeStyle(t.type.captionStrong, t.primary.text, t.type.family),
    estimated: typeStyle(t.type.caption, t.text.tertiary, t.type.family),
  }),
);

export function HealthHero({ score, bandId, bandLabel, isEstimated, onPress }: HealthHeroProps) {
  const styles = useStyles();
  const { tokens } = useTheme();
  const strings = useStrings();
  const showEstimated = isEstimated && score !== null;
  const baseA11y = interpolate(strings.dashboard.health.a11y, { score: score ?? 'not set up', band: bandLabel });
  const a11yLabel = showEstimated ? `${baseA11y} ${strings.dashboard.health.estimated}.` : baseA11y;

  return (
    <Card onPress={onPress} accessibilityLabel={a11yLabel} size="lg">
      <View style={styles.inner}>
        <HealthRing
          score={score}
          bandLabel={bandLabel}
          color={bandId !== null ? tokens.health[bandId] : tokens.status.neutral.base}
          colorBg={bandId !== null ? tokens.status[BAND_TINT[bandId]].bg : tokens.status.neutral.bg}
          scoreSuffix={strings.dashboard.health.scoreOf}
          accessibilityLabel={a11yLabel}
        />
        {showEstimated ? <Text style={styles.estimated}>{strings.dashboard.health.estimated}</Text> : null}
        <View style={styles.captionRow}>
          <Text style={styles.caption}>{strings.dashboard.health.caption}</Text>
          <Icon name="arrowRight" size={tokens.iconSize.inline} color={tokens.primary.text} />
        </View>
      </View>
    </Card>
  );
}
