import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { makeStyles, typeStyle } from '@/theme/styles';
import { useTheme } from '@/theme/useTheme';

export interface TimelineItemProps {
  icon: IconName;
  title: string;
  caption: string;
  /** Optional third line (e.g. notes), truncated to one line. */
  detail?: string | undefined;
  amount: string;
  /** Repairs render visually distinct: icon + accent edge. */
  isRepair?: boolean;
  onPress: () => void;
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.s3,
      minHeight: t.size.row,
      paddingHorizontal: t.space.s4,
      paddingVertical: t.space.s3,
    },
    iconWell: {
      width: t.size.iconWell,
      height: t.size.iconWell,
      borderRadius: t.radius.md,
      backgroundColor: t.bg.surfaceVariant,
      alignItems: 'center',
      justifyContent: 'center',
    },
    repairEdge: {
      borderLeftWidth: 3,
      borderLeftColor: t.accent,
    },
    body: {
      flex: 1,
      gap: 2,
    },
    title: typeStyle(t.type.bodyStrong, t.text.primary, t.type.family),
    caption: typeStyle(t.type.caption, t.text.secondary, t.type.family),
    amount: {
      ...typeStyle(t.type.bodyStrong, t.text.primary, t.type.family),
      fontVariant: ['tabular-nums'],
    },
  }),
);

export function TimelineItem({ icon, title, caption, detail, amount, isRepair = false, onPress }: TimelineItemProps) {
  const styles = useStyles();
  const { tokens } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      dim
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${caption}${detail !== undefined ? `, ${detail}` : ''}, ${amount}`}
      style={[styles.row, isRepair && styles.repairEdge]}
    >
      <View style={styles.iconWell}>
        <Icon name={icon} size={tokens.iconSize.listLeading} {...(isRepair ? { color: tokens.accent } : {})} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.caption}>{caption}</Text>
        {detail !== undefined ? (
          <Text style={styles.caption} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {amount !== '' ? <Text style={styles.amount}>{amount}</Text> : null}
    </PressableScale>
  );
}
