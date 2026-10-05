import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { ListSection } from '@/components/ListSection';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { QuickAddForm } from '@/features/quickAdd/QuickAddForm';
import { useActiveBike } from '@/hooks/useActiveBike';
import { makeStyles, typeStyle } from '@/theme/styles';
import { useTheme } from '@/theme/useTheme';

interface LogOption {
  icon: IconName;
  label: string;
  caption: string;
  href: '/maintenance/log' | '/fuel/log' | '/expense/log' | '/repair/log' | '/odometer';
}

const OPTIONS: LogOption[] = [
  { icon: 'maintenance', label: 'Log maintenance', caption: 'Oil, tires, brakes, and more', href: '/maintenance/log' },
  { icon: 'fuel', label: 'Log fuel', caption: 'Track cost and consumption', href: '/fuel/log' },
  { icon: 'expense', label: 'Add expense', caption: 'Registration, gear, parking', href: '/expense/log' },
  { icon: 'repair', label: 'Log repair', caption: 'Unplanned fixes', href: '/repair/log' },
  { icon: 'odometer', label: 'Update odometer', caption: 'Keep your mileage current', href: '/odometer' },
];

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    title: typeStyle(t.type.h1, t.text.primary),
    subtitle: typeStyle(t.type.body, t.text.secondary),
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
      backgroundColor: t.primary.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: { flex: 1, gap: 2 },
    label: typeStyle(t.type.bodyStrong, t.text.primary),
    caption: typeStyle(t.type.caption, t.text.tertiary),
  }),
);

/** Log launcher (center tab, raised FAB) — routes to each logging form. */
export default function LogRoute() {
  const styles = useStyles();
  const router = useRouter();
  const { tokens } = useTheme();
  const { activeBike } = useActiveBike();

  return (
    <Screen withTabBarInset>
      <Text style={styles.title}>Log</Text>
      {activeBike !== null ? <QuickAddForm motorcycleId={activeBike.id} /> : null}
      <ListSection title="Detailed logs">
        {OPTIONS.map((option) => (
          <PressableScale
            key={option.href}
            style={styles.row}
            onPress={() => {
              if (activeBike !== null) {
                router.push(option.href);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={option.label}>
            <View style={styles.iconWell}>
              <Icon name={option.icon} size={tokens.iconSize.md} color={tokens.primary.text} />
            </View>
            <View style={styles.body}>
              <Text style={styles.label}>{option.label}</Text>
              <Text style={styles.caption}>{option.caption}</Text>
            </View>
            <Icon name="chevronRight" size={tokens.iconSize.inline} color={tokens.icon.secondary} />
          </PressableScale>
        ))}
      </ListSection>
    </Screen>
  );
}
