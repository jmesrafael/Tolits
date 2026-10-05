import { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { sanitizePesosText } from '@/lib/format';
import { makeStyles, typeStyle } from '@/theme/styles';
import { useTheme } from '@/theme/useTheme';

export interface MoneyInputProps {
  /** Displayed value as pesos-and-centavos text, e.g. "450.00". */
  value: string;
  onChange: (value: string) => void;
  returnKeyType?: 'done' | 'next';
  onSubmitEditing?: () => void;
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: t.size.input,
      borderRadius: t.radius.sm,
      borderWidth: 1.5,
      borderColor: 'transparent',
      backgroundColor: t.bg.input,
      paddingHorizontal: t.space.s4,
    },
    focused: {
      borderColor: t.border.focus,
      backgroundColor: t.bg.inputFocused,
    },
    prefix: typeStyle(t.type.bodyStrong, t.text.secondary, t.type.family),
    input: {
      flex: 1,
      marginLeft: t.space.s1,
      color: t.text.primary,
      fontSize: t.type.body.fontSize,
      fontVariant: ['tabular-nums'],
    },
  }),
);

/**
 * ₱ prefix money entry; caller converts to centavos with parsePesosToCentavos (ADR-008).
 * Forwards its ref so a form can move focus here (e.g. after the item name's Next).
 */
export const MoneyInput = forwardRef<TextInput, MoneyInputProps>(function MoneyInput(
  { value, onChange, returnKeyType = 'done', onSubmitEditing },
  ref,
) {
  const styles = useStyles();
  const { tokens } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.row, focused && styles.focused]}>
      <Text style={styles.prefix}>₱</Text>
      <TextInput
        ref={ref}
        style={styles.input}
        value={value}
        onChangeText={(t) => onChange(sanitizePesosText(t))}
        keyboardType="decimal-pad"
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        placeholder="0.00"
        placeholderTextColor={tokens.text.placeholder}
        accessibilityLabel="Amount, pesos"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
});
