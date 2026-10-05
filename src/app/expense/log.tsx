import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DateField } from '@/components/DateField';
import { DestructiveButton } from '@/components/DestructiveButton';
import { FormField } from '@/components/FormField';
import { ImagesField } from '@/components/ImagesField';
import { ImageViewerModal } from '@/components/ImageViewerModal';
import { MoneyInput } from '@/components/MoneyInput';
import { PickerField } from '@/components/PickerField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SearchOrAdd } from '@/components/SearchOrAdd';
import { TextField } from '@/components/TextField';
import { showToast } from '@/components/Toast';
import { BuildRepository } from '@/db/repositories/BuildRepository';
import { ExpenseRepository } from '@/db/repositories/ExpenseRepository';
import { useActiveBike } from '@/hooks/useActiveBike';
import { todayIso } from '@/lib/dates';
import { formatCategoryName } from '@/lib/format';
import { ExpenseService, parseExpenseImages } from '@/services/ExpenseService';
import { ImageStorage } from '@/services/imageStorage';
import { makeStyles, typeStyle } from '@/theme/styles';
import { EXPENSE_CATEGORIES } from '@/types/enums';

const useStyles = makeStyles((t) => ({
  title: typeStyle(t.type.h1, t.text.primary),
  error: typeStyle(t.type.caption, t.feedback.error.base),
}));

/** Fuel gets its own tab (Money -> Fuel) and its own logging flow; too general as one bucket among many here (item 16). */
const NEW_ENTRY_CATEGORIES = EXPENSE_CATEGORIES.filter((c) => c !== 'fuel');

/** S-23 Add/Edit standalone expense (fuel/maintenance/repair are logged in their own tabs). */
export default function ExpenseLogRoute() {
  const {
    expenseId,
    scheduleId: scheduleIdParam,
    buildId: buildIdParam,
  } = useLocalSearchParams<{
    expenseId?: string;
    scheduleId?: string;
    buildId?: string;
  }>();
  const router = useRouter();
  const styles = useStyles();
  const { activeBike } = useActiveBike();
  const existing = expenseId !== undefined ? ExpenseRepository.getById(expenseId) : undefined;
  const isLegacyFuel = existing?.category === 'fuel';

  const bikeId = existing?.motorcycleId ?? activeBike?.id ?? null;
  const builds = bikeId !== null ? BuildRepository.listByBike(bikeId) : [];

  const [title, setTitle] = useState(existing?.title ?? '');
  const [category, setCategory] = useState(existing?.category ?? 'other');
  const [amount, setAmount] = useState(existing !== undefined ? (existing.amountCentavos / 100).toFixed(2) : '');
  const [date, setDate] = useState(existing?.expenseDate ?? todayIso());
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [images, setImages] = useState<string[]>(existing !== undefined ? parseExpenseImages(existing) : []);
  const [buildId, setBuildId] = useState<string | null>(existing?.buildId ?? buildIdParam ?? null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>();
  const [error, setError] = useState<string>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const existingCategories = ExpenseRepository.listDistinctCategories().filter((c) => c !== 'fuel');
  const categoryOptions = [
    ...new Map(
      [
        ...NEW_ENTRY_CATEGORIES.map((c) => ({
          value: c,
          label: formatCategoryName(c),
        })),
        ...existingCategories.map((c) => ({
          value: c,
          label: formatCategoryName(c),
        })),
      ].map((o) => [o.value.toLowerCase(), o]),
    ).values(),
  ];

  if (bikeId === null) {
    return (
      <Screen>
        <Text style={styles.title}>No motorcycle selected</Text>
      </Screen>
    );
  }

  const handleSubmit = () => {
    const input = {
      title,
      category,
      amountCentavos: amount !== '' ? Math.round(Number(amount) * 100) : 0,
      expenseDate: date,
      notes: notes !== '' ? notes : null,
      images: images.length > 0 ? images : null,
      buildId,
      scheduleId: existing?.scheduleId ?? scheduleIdParam ?? null,
    };
    const result =
      existing !== undefined
        ? ExpenseService.editExpense(existing.id, input)
        : ExpenseService.saveExpense(bikeId, input);
    if (!result.ok) {
      setFieldErrors(result.error.fieldErrors);
      setError(result.error.message);
      return;
    }
    showToast(existing !== undefined ? 'Expense updated' : 'Expense saved');
    router.back();
  };

  const handleDelete = () => {
    setConfirmingDelete(false);
    if (existing !== undefined) {
      ExpenseService.deleteExpense(existing.id);
      showToast({ kind: 'info', message: 'Expense deleted' });
      router.back();
    }
  };

  return (
    <Screen>
      <ScreenHeader title={existing !== undefined ? 'Edit expense' : 'Add expense'} />
      {error !== undefined ? <Text style={styles.error}>{error}</Text> : null}
      {isLegacyFuel ? (
        <Text style={styles.error}>
          This is a fuel expense from before Fuel had its own tab. It stays here for your records; new fuel entries go
          under Money &gt; Fuel.
        </Text>
      ) : null}
      <FormField label="Item" hint="What you bought, e.g. Motul 10W-40. Shown in the list." error={fieldErrors?.title}>
        <TextField value={title} onChangeText={setTitle} maxLength={60} placeholder="What you bought" />
      </FormField>
      <FormField label="Category" required error={fieldErrors?.category}>
        <SearchOrAdd
          options={categoryOptions}
          value={category}
          onSelect={setCategory}
          onAdd={setCategory}
          placeholder="Search or add a category"
        />
      </FormField>
      <FormField label="Amount" required error={fieldErrors?.amountCentavos}>
        <MoneyInput value={amount} onChange={setAmount} />
      </FormField>
      <FormField label="Date" required error={fieldErrors?.expenseDate}>
        <DateField value={date} onChange={setDate} maxIso={todayIso()} />
      </FormField>
      {builds.length > 0 ? (
        <FormField label="Build" hint="Optional. Groups this expense with a project like a Classic Build.">
          <PickerField
            options={[{ value: '', label: 'None' }, ...builds.map((b) => ({ value: b.id, label: b.name }))]}
            value={buildId ?? ''}
            onChange={(v) => setBuildId(v === '' ? null : v)}
            placeholder="None"
          />
        </FormField>
      ) : null}
      <FormField label="Notes" error={fieldErrors?.notes}>
        <TextField value={notes} onChangeText={setNotes} multiline maxLength={500} />
      </FormField>
      <FormField label="Photos">
        <ImagesField images={images} onChange={setImages} onViewImage={setViewerIndex} />
      </FormField>
      <PrimaryButton label={existing !== undefined ? 'Save changes' : 'Save'} onPress={handleSubmit} />
      {existing !== undefined ? (
        <DestructiveButton label="Delete expense" onPress={() => setConfirmingDelete(true)} />
      ) : null}
      <ConfirmDialog
        visible={confirmingDelete}
        title="Delete this expense?"
        body="This removes it from your spending history. Recoverable for 30 days."
        confirmLabel="Delete expense"
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
      <ImageViewerModal
        visible={viewerIndex !== null}
        images={images.map((path) => ImageStorage.uriFor(path))}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />
    </Screen>
  );
}
