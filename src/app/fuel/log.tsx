import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DateField } from '@/components/DateField';
import { DestructiveButton } from '@/components/DestructiveButton';
import { FormField } from '@/components/FormField';
import { MoneyInput } from '@/components/MoneyInput';
import { OdoInput } from '@/components/OdoInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { showToast } from '@/components/Toast';
import { Toggle } from '@/components/Toggle';
import { FuelRepository } from '@/db/repositories/FuelRepository';
import { formatOdometerReference, initialOdometerField } from '@/features/odometer/odometerText';
import { useActiveBike } from '@/hooks/useActiveBike';
import { useToday } from '@/hooks/useToday';
import { useStrings } from '@/i18n/useStrings';
import { todayIso } from '@/lib/dates';
import { FuelLogService } from '@/services/FuelLogService';
import { OdometerService } from '@/services/OdometerService';
import { makeStyles, typeStyle } from '@/theme/styles';

const useStyles = makeStyles((t) => ({
  title: typeStyle(t.type.h1, t.text.primary),
  error: typeStyle(t.type.caption, t.feedback.error.base),
}));

/** S-21 Log fuel. */
export default function FuelLogRoute() {
  const { fuelLogId } = useLocalSearchParams<{ fuelLogId?: string }>();
  const router = useRouter();
  const styles = useStyles();
  const { activeBike } = useActiveBike();
  const today = useToday();
  const strings = useStrings();
  const existing = fuelLogId !== undefined ? FuelRepository.getById(fuelLogId) : undefined;

  const [date, setDate] = useState(existing?.fuelDate ?? todayIso());
  const [liters, setLiters] = useState(existing !== undefined ? String(existing.liters) : '');
  const [totalCost, setTotalCost] = useState(
    existing !== undefined ? (existing.totalCostCentavos / 100).toFixed(2) : '',
  );
  // New logs start empty — the last reading is shown as a reference, never pre-filled as today's reading.
  const [odometer, setOdometer] = useState(initialOdometerField(existing?.odometerKm));
  const [station, setStation] = useState(existing?.station ?? FuelRepository.lastStation(activeBike?.id ?? '') ?? '');
  const [isFullTank, setIsFullTank] = useState(existing?.isFullTank !== 0);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>();
  const [error, setError] = useState<string>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const bikeId = existing?.motorcycleId ?? activeBike?.id ?? null;
  const odometerReference =
    bikeId !== null ? formatOdometerReference(OdometerService.getSnapshot(bikeId, today), strings) : '';
  if (bikeId === null) {
    return (
      <Screen>
        <Text style={styles.title}>No motorcycle selected</Text>
      </Screen>
    );
  }

  const handleSubmit = () => {
    if (odometer === '') {
      // Required for fuel logs: an empty field must never become a 0 km (or any) reading.
      setFieldErrors({ odometerKm: strings.odometerReference.requiredError });
      setError(undefined);
      return;
    }
    const input = {
      fuelDate: date,
      liters: liters !== '' ? Number(liters) : 0,
      totalCostCentavos: totalCost !== '' ? Math.round(Number(totalCost) * 100) : 0,
      odometerKm: Number(odometer),
      station: station !== '' ? station : null,
      isFullTank,
      notes: notes !== '' ? notes : null,
    };
    const result =
      existing !== undefined
        ? FuelLogService.editFuelLog(existing.id, input)
        : FuelLogService.saveFuelLog(bikeId, input);
    if (!result.ok) {
      setFieldErrors(result.error.fieldErrors);
      setError(result.error.message);
      return;
    }
    showToast(existing !== undefined ? 'Fuel log updated' : 'Fuel log saved');
    router.back();
  };

  const handleDelete = () => {
    setConfirmingDelete(false);
    if (existing !== undefined) {
      FuelLogService.deleteFuelLog(existing.id);
      showToast({ kind: 'info', message: 'Fuel log deleted' });
      router.back();
    }
  };

  const priceLabel =
    liters !== '' && totalCost !== '' && Number(liters) > 0
      ? `₱${(Number(totalCost) / Number(liters)).toFixed(2)}/L`
      : '';

  return (
    <Screen>
      <ScreenHeader title={existing !== undefined ? 'Edit fuel log' : 'Log fuel'} />
      {error !== undefined ? <Text style={styles.error}>{error}</Text> : null}
      <FormField label="Liters" required error={fieldErrors?.liters}>
        <TextField value={liters} onChangeText={(v) => setLiters(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
      </FormField>
      <FormField label="Total cost" required error={fieldErrors?.totalCostCentavos} hint={priceLabel}>
        <MoneyInput value={totalCost} onChange={setTotalCost} />
      </FormField>
      <FormField label="Odometer (km)" required error={fieldErrors?.odometerKm} hint={odometerReference}>
        <OdoInput value={odometer} onChange={setOdometer} />
      </FormField>
      <FormField label="Date" required error={fieldErrors?.fuelDate}>
        <DateField value={date} onChange={setDate} maxIso={todayIso()} />
      </FormField>
      <FormField label="Station" error={fieldErrors?.station}>
        <TextField value={station} onChangeText={setStation} maxLength={40} placeholder="Petron, Shell, Caltex…" />
      </FormField>
      <Toggle value={isFullTank} onChange={setIsFullTank} label="Full tank" />
      <FormField label="Notes" error={fieldErrors?.notes}>
        <TextField value={notes} onChangeText={setNotes} multiline maxLength={500} />
      </FormField>
      <PrimaryButton label={existing !== undefined ? 'Save changes' : 'Save'} onPress={handleSubmit} />
      {existing !== undefined ? (
        <DestructiveButton label="Delete fuel log" onPress={() => setConfirmingDelete(true)} />
      ) : null}
      <ConfirmDialog
        visible={confirmingDelete}
        title="Delete this fuel log?"
        body="This removes it from your fuel history and consumption stats. Recoverable for 30 days."
        confirmLabel="Delete log"
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </Screen>
  );
}
