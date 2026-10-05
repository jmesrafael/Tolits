import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { DateField } from '@/components/DateField';
import { FormField } from '@/components/FormField';
import { MoneyInput } from '@/components/MoneyInput';
import { OdoInput } from '@/components/OdoInput';
import { PickerField } from '@/components/PickerField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { showToast } from '@/components/Toast';
import { TextField } from '@/components/TextField';
import { todayIso } from '@/lib/dates';
import { formatCategoryName, formatComponentName, parsePesosToCentavos } from '@/lib/format';
import { OdometerService } from '@/services/OdometerService';
import { classifyQuickAdd, parseTargetKey, targetKey, type QuickAddTarget } from '@/services/QuickAddClassifier';
import { QuickAddService, type QuickAddSaved } from '@/services/QuickAddService';
import { makeStyles, typeStyle } from '@/theme/styles';
import { COMPONENT_TYPES, EXPENSE_CATEGORIES } from '@/types/enums';

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    heading: typeStyle(t.type.h2, t.text.primary),
    hint: typeStyle(t.type.caption, t.text.tertiary),
    error: typeStyle(t.type.caption, t.feedback.error.base),
  }),
);

/** Human label for a classification, e.g. "Maintenance · Engine oil". */
export function describeTarget(target: QuickAddTarget): string {
  switch (target.kind) {
    case 'maintenance':
      return `Maintenance · ${formatComponentName(target.componentType, null)}`;
    case 'fuel':
      return 'Fuel';
    case 'repair':
      return 'Repair';
    case 'expense':
      return `Expense · ${formatCategoryName(target.category)}`;
  }
}

const TARGET_OPTIONS = [
  ...COMPONENT_TYPES.filter((c) => c !== 'custom').map((c) => ({
    value: targetKey({ kind: 'maintenance', componentType: c }),
    label: describeTarget({ kind: 'maintenance', componentType: c }),
  })),
  { value: 'fuel', label: 'Fuel' },
  { value: 'repair', label: 'Repair' },
  ...EXPENSE_CATEGORIES.filter((c) => c !== 'fuel').map((c) => ({
    value: targetKey({ kind: 'expense', category: c }),
    label: describeTarget({ kind: 'expense', category: c }),
  })),
];

/** Field codes from the validation layer → words a rider would use. */
const FIELD_LABELS: Record<string, string> = {
  title: 'item',
  amountCentavos: 'amount',
  expenseDate: 'date',
  odometerKm: 'odometer',
  liters: 'liters',
  category: 'category',
  totalCostCentavos: 'amount',
  fuelDate: 'date',
  costCentavos: 'amount',
  repairDate: 'date',
};

function errorMessage(error: { message: string; fieldErrors?: Record<string, string> | undefined }): string {
  if (error.fieldErrors === undefined) {
    return error.message;
  }
  const names = [...new Set(Object.keys(error.fieldErrors).map((f) => FIELD_LABELS[f] ?? f))];
  return names.length > 0 ? `Check the ${names.join(', ')}.` : error.message;
}

function savedLabel(saved: QuickAddSaved): string {
  if (saved.record === 'maintenance') {
    return `Saved · ${describeTarget({ kind: 'maintenance', componentType: saved.componentType })}`;
  }
  if (saved.record === 'expense' && saved.fallbackFrom !== undefined) {
    return `Saved as expense. ${formatComponentName(saved.fallbackFrom, null)} has no schedule yet.`;
  }
  return `Saved · ${saved.record === 'fuel' ? 'Fuel' : saved.record === 'repair' ? 'Repair' : 'Expense'}`;
}

interface QuickAddFormProps {
  motorcycleId: string;
}

/**
 * Quick Add: item name + price is the whole required input. Classification is a
 * suggestion the rider can override. Saving routes to the existing services
 * through QuickAddService.
 */
export function QuickAddForm({ motorcycleId }: QuickAddFormProps) {
  const styles = useStyles();
  const amountRef = useRef<TextInput>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [override, setOverride] = useState<string | null>(null);
  const [liters, setLiters] = useState('');
  const [odometer, setOdometer] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string>();

  // Shown as "last known" only. It is never written into a record: fuel km/L is
  // computed from the fuel fill's own odometer, so a guessed value would corrupt it.
  const lastKnownKm = useMemo(() => OdometerService.getSnapshot(motorcycleId, todayIso())?.actualKm, [motorcycleId]);

  const detected = classifyQuickAdd(title).target;
  const effective = override !== null ? (parseTargetKey(override) ?? detected) : detected;
  const isFuel = effective.kind === 'fuel';
  const amountCentavos = parsePesosToCentavos(amount);
  const canSave = title.trim() !== '' && amountCentavos !== null && amountCentavos > 0;

  const reset = () => {
    setTitle('');
    setAmount('');
    setLiters('');
    setOdometer('');
    setOverride(null);
    setError(undefined);
  };

  const handleSave = () => {
    setError(undefined);
    // The keyboard's Done key also lands here, so re-check the required fields.
    if (!canSave || amountCentavos === null) {
      return;
    }
    const odometerKm = odometer.trim() === '' ? null : Math.round(Number(odometer));
    // Accept a comma decimal ("8,2") as well as a dot. Anything else stays NaN and fails validation.
    const litersValue = liters.trim() === '' ? undefined : Number(liters.replace(',', '.'));
    const result = QuickAddService.save(motorcycleId, {
      title: title.trim(),
      amountCentavos,
      date,
      target: effective,
      liters: litersValue,
      odometerKm,
    });
    if (!result.ok) {
      // Keep everything typed so a failed save can be corrected and retried.
      setError(errorMessage(result.error));
      return;
    }
    showToast(savedLabel(result.value));
    reset();
  };

  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.heading}>Quick add</Text>
      <FormField label="What did you buy or do?" required>
        <TextField
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Motul 10W-40, Petron, helmet"
          maxLength={60}
          returnKeyType="next"
          onSubmitEditing={() => amountRef.current?.focus()}
          blurOnSubmit={false}
          autoFocus
          accessibilityLabel="What did you buy or do"
        />
      </FormField>
      <FormField label="How much?" required>
        <MoneyInput
          ref={amountRef}
          value={amount}
          onChange={setAmount}
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />
      </FormField>

      {title.trim() !== '' ? (
        <FormField label="Recorded as" hint="Tap to change if this is wrong.">
          <PickerField
            options={TARGET_OPTIONS}
            value={targetKey(effective)}
            onChange={setOverride}
            placeholder="Choose"
          />
        </FormField>
      ) : null}

      {isFuel ? (
        <View style={{ gap: 12 }}>
          <FormField label="Liters" hint="Needed for km/L. Fuel without liters can't be saved.">
            <TextField value={liters} onChangeText={setLiters} keyboardType="decimal-pad" placeholder="e.g. 8.2" />
          </FormField>
          <FormField label="Odometer" hint="Enter the reading from this fill-up. It isn't guessed for you.">
            <OdoInput value={odometer} onChange={setOdometer} lastReadingKm={lastKnownKm} />
          </FormField>
        </View>
      ) : null}

      <Text style={styles.hint} onPress={() => setShowMore((v) => !v)} accessibilityRole="button">
        {showMore ? 'Less details ▴' : 'More details ▾'}
      </Text>
      {showMore ? (
        <View style={{ gap: 12 }}>
          <FormField label="Date">
            <DateField value={date} onChange={setDate} maxIso={todayIso()} />
          </FormField>
          {!isFuel ? (
            <FormField label="Odometer" hint="Optional. Leave blank if you don't know it; logging still works.">
              <OdoInput value={odometer} onChange={setOdometer} lastReadingKm={lastKnownKm} />
            </FormField>
          ) : null}
        </View>
      ) : (
        <Text style={styles.hint}>
          {date === todayIso() ? 'Today' : date}
          {lastKnownKm !== undefined ? ` · last known ${lastKnownKm.toLocaleString('en-PH')} km` : ''}
        </Text>
      )}

      {error !== undefined ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label="Save" onPress={handleSave} disabled={!canSave} />
    </View>
  );
}
