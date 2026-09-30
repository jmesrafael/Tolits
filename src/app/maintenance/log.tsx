import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { CompletionOverlay } from '@/components/CompletionOverlay';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DateField } from '@/components/DateField';
import { DestructiveButton } from '@/components/DestructiveButton';
import { FormField } from '@/components/FormField';
import { MoneyInput } from '@/components/MoneyInput';
import { OdoInput } from '@/components/OdoInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SearchOrAdd } from '@/components/SearchOrAdd';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TextField } from '@/components/TextField';
import { showToast } from '@/components/Toast';
import { MaintenanceRepository } from '@/db/repositories/MaintenanceRepository';
import { ScheduleRepository } from '@/db/repositories/ScheduleRepository';
import { componentLabel } from '@/features/maintenance/componentMeta';
import { formatOdometerReference, initialOdometerField } from '@/features/odometer/odometerText';
import { useActiveBike } from '@/hooks/useActiveBike';
import { useToday } from '@/hooks/useToday';
import { interpolate } from '@/i18n/strings';
import { useStrings } from '@/i18n/useStrings';
import { todayIso } from '@/lib/dates';
import { MaintenanceService } from '@/services/MaintenanceService';
import { OdometerService } from '@/services/OdometerService';
import { ScheduleService } from '@/services/ScheduleService';
import { componentDefaultServiceType } from '@/db/seed/defaults';
import { makeStyles, typeStyle } from '@/theme/styles';
import { SERVICE_TYPES, type ComponentType, type ServiceType } from '@/types/enums';

const useStyles = makeStyles((t) => ({
  title: typeStyle(t.type.h1, t.text.primary),
  error: typeStyle(t.type.caption, t.feedback.error.base),
  form: { gap: t.space.s4 },
}));

const SERVICE_TYPE_OPTIONS = SERVICE_TYPES.map((s) => ({
  value: s,
  label: s === 'replace' ? 'Replace' : s === 'clean' ? 'Clean' : 'Adjust',
}));

/** S-12 Log maintenance (full form) — also handles edit via ?recordId. */
export default function MaintenanceLogRoute() {
  const params = useLocalSearchParams<{ scheduleId?: string; recordId?: string }>();
  const router = useRouter();
  const styles = useStyles();
  const { activeBike } = useActiveBike();
  const today = useToday();
  const strings = useStrings();

  const existingRecord = params.recordId !== undefined ? MaintenanceRepository.getById(params.recordId) : undefined;
  const initialScheduleId = existingRecord?.scheduleId ?? params.scheduleId ?? null;

  const bikeId = existingRecord?.motorcycleId ?? activeBike?.id ?? null;
  const [refreshKey, setRefreshKey] = useState(0);
  void refreshKey;
  const schedules = bikeId !== null ? ScheduleRepository.listByBike(bikeId).filter((s) => s.isEnabled === 1) : [];

  const [scheduleId, setScheduleId] = useState<string | null>(initialScheduleId);
  const schedule = scheduleId !== null ? ScheduleRepository.getById(scheduleId) : undefined;

  const [date, setDate] = useState(existingRecord?.performedDate ?? todayIso());
  // New records start empty: left blank, the service is recorded by date only (mileage unknown);
  // the last reading is shown as a reference, never pre-filled as today's reading.
  const [odometer, setOdometer] = useState(initialOdometerField(existingRecord?.odometerKm));
  const odometerReference =
    bikeId !== null ? formatOdometerReference(OdometerService.getSnapshot(bikeId, today), strings) : '';
  const [cost, setCost] = useState(
    existingRecord?.costCentavos !== undefined && existingRecord?.costCentavos !== null
      ? (existingRecord.costCentavos / 100).toFixed(2)
      : '',
  );
  const [serviceType, setServiceType] = useState<ServiceType>(
    (existingRecord?.serviceType as ServiceType) ??
      (schedule !== undefined ? componentDefaultServiceType(schedule.componentType as ComponentType) : 'replace'),
  );
  const [brand, setBrand] = useState(existingRecord?.brand ?? '');
  const [notes, setNotes] = useState(existingRecord?.notes ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>();
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);

  if (bikeId === null) {
    return (
      <Screen>
        <Text style={styles.title}>No motorcycle selected</Text>
      </Screen>
    );
  }

  const handleSubmit = () => {
    if (scheduleId === null) {
      setFormError('Choose a component');
      return;
    }
    setSubmitting(true);
    setFormError(undefined);
    const input = {
      scheduleId,
      performedDate: date,
      odometerKm: odometer !== '' ? Number(odometer) : null,
      serviceType,
      costCentavos: cost !== '' ? Math.round(Number(cost) * 100) : null,
      brand: brand !== '' ? brand : null,
      quantity: null,
      details: null,
      notes: notes !== '' ? notes : null,
      photoPath: null,
    };
    const isNew = existingRecord === undefined;
    const result = isNew
      ? MaintenanceService.saveRecord(bikeId, input)
      : MaintenanceService.editRecord(existingRecord.id, input);
    setSubmitting(false);
    if (!result.ok) {
      setFieldErrors(result.error.fieldErrors);
      setFormError(result.error.message);
      return;
    }
    if (isNew) {
      // Form → saved-state transition: a brief celebration before handing back.
      setShowCompletion(true);
    } else {
      showToast('Maintenance updated');
      router.back();
    }
  };

  const handleDelete = () => {
    setConfirmingDelete(false);
    if (existingRecord !== undefined) {
      MaintenanceService.deleteRecord(existingRecord.id);
      showToast({ kind: 'info', message: 'Record deleted' });
      router.back();
    }
  };

  return (
    <Screen>
      <ScreenHeader title={existingRecord !== undefined ? 'Edit record' : 'Log maintenance'} />
      {formError !== undefined ? <Text style={styles.error}>{formError}</Text> : null}
      <FormField label="Component" required error={fieldErrors?.scheduleId}>
        <SearchOrAdd
          options={schedules.map((s) => ({
            value: s.id,
            label: componentLabel(s.componentType as ComponentType, s.customName),
          }))}
          value={scheduleId}
          onSelect={setScheduleId}
          onAdd={(label) => {
            if (bikeId === null) {
              return;
            }
            const result = ScheduleService.addCustomComponent(bikeId, {
              customName: label,
              intervalKm: null,
              // A neutral starting interval; editable anytime from the component screen.
              intervalMonths: 6,
            });
            if (result.ok) {
              setScheduleId(result.value.id);
              setRefreshKey((k) => k + 1);
              showToast(`Added "${label}" as a custom component`);
            } else {
              setFormError(result.error.message);
            }
          }}
          placeholder="Search or add a component"
          addLabel="Add as custom component"
        />
      </FormField>
      <FormField label="Date" required error={fieldErrors?.performedDate}>
        <DateField value={date} onChange={setDate} maxIso={todayIso()} />
      </FormField>
      <FormField
        label="Odometer (km)"
        error={fieldErrors?.odometerKm}
        hint={interpolate(strings.odometerReference.optionalHint, { reference: odometerReference })}>
        <OdoInput value={odometer} onChange={setOdometer} />
      </FormField>
      <FormField label="Service type">
        <SegmentedControl segments={SERVICE_TYPE_OPTIONS} value={serviceType} onChange={setServiceType} />
      </FormField>
      <FormField label="Cost" error={fieldErrors?.costCentavos}>
        <MoneyInput value={cost} onChange={setCost} />
      </FormField>
      <FormField label="Brand / product" error={fieldErrors?.brand}>
        <TextField value={brand} onChangeText={setBrand} maxLength={40} />
      </FormField>
      <FormField label="Notes" error={fieldErrors?.notes}>
        <TextField value={notes} onChangeText={setNotes} maxLength={500} multiline />
      </FormField>
      <PrimaryButton
        label={existingRecord !== undefined ? 'Save changes' : 'Save'}
        loading={submitting}
        onPress={handleSubmit}
      />
      {existingRecord !== undefined ? (
        <DestructiveButton label="Delete record" onPress={() => setConfirmingDelete(true)} />
      ) : null}
      <ConfirmDialog
        visible={confirmingDelete}
        title="Delete maintenance record?"
        body="This removes the logged service and its cost from this component's history. This can be recovered for 30 days."
        confirmLabel="Delete record"
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
      <CompletionOverlay
        visible={showCompletion}
        message="Maintenance saved"
        onDone={() => {
          setShowCompletion(false);
          showToast('Maintenance saved');
          router.back();
        }}
      />
    </Screen>
  );
}
