import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { makeStyles, typeStyle } from '@/theme/styles';
import { useTheme } from '@/theme/useTheme';

export interface OdoInputProps {
  value: string;
  onChange: (value: string) => void;
  lastReadingKm?: number | undefined;
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    root: { gap: t.space.s1 },
    input: {
      minHeight: 64,
      borderRadius: t.radius.md,
      borderWidth: 1.5,
      borderColor: 'transparent',
      backgroundColor: t.bg.input,
      paddingHorizontal: t.space.s4,
      color: t.text.primary,
      fontSize: t.type.display.fontSize,
      fontVariant: ['tabular-nums'],
    },
    focused: {
      borderColor: t.border.focus,
      backgroundColor: t.bg.inputFocused,
    },
    caption: typeStyle(t.type.caption, t.text.tertiary, t.type.family),
  }),
);

/** Odometer entry: big keypad, tabular numerals. */
export function OdoInput({ value, onChange, lastReadingKm }: OdoInputProps) {
  const styles = useStyles();
  const { tokens } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.root}>
      <TextInput
        style={[styles.input, focused && styles.focused]}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={tokens.text.placeholder}
        accessibilityLabel="Odometer, kilometers"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {lastReadingKm !== undefined ? (
        <Text style={styles.caption}>last: {lastReadingKm.toLocaleString('en-PH')} km</Text>
      ) : null}
    </View>
  );
}
