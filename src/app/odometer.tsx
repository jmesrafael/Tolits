import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text } from 'react-native';

import { OdoInput } from '@/components/OdoInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SecondaryButton } from '@/components/SecondaryButton';
import { showToast } from '@/components/Toast';
import { formatOdometerReference } from '@/features/odometer/odometerText';
import { useActiveBike } from '@/hooks/useActiveBike';
import { useToday } from '@/hooks/useToday';
import { useStrings } from '@/i18n/useStrings';
import { todayIso } from '@/lib/dates';
import { OdometerService } from '@/services/OdometerService';
import { makeStyles, typeStyle } from '@/theme/styles';

const useStyles = makeStyles((t) => ({
  title: typeStyle(t.type.h1, t.text.primary),
  caption: typeStyle(t.type.caption, t.text.secondary),
  error: typeStyle(t.type.caption, t.feedback.error.base),
}));

/** S-25 Odometer update modal (R-12) — big-keypad reading with §6.3 correction options. */
export default function OdometerUpdateRoute() {
  const router = useRouter();
  const styles = useStyles();
  const { activeBike } = useActiveBike();
  const [reading, setReading] = useState('');
  const [violation, setViolation] = useState<string>();
  const [showMeterReplace, setShowMeterReplace] = useState(false);
  const today = useToday();
  const strings = useStrings();
  const snapshot = useMemo(
    () => (activeBike !== null ? OdometerService.getSnapshot(activeBike.id, today) : null),
    [activeBike, today],
  );

  if (activeBike === null) {
    return (
      <Screen>
        <Text style={styles.title}>No motorcycle selected</Text>
      </Screen>
    );
  }

  const handleSave = () => {
    const result = OdometerService.logManualReading(activeBike.id, {
      readingKm: Number(reading),
      recordedDate: todayIso(),
    });
    if (!result.ok) {
      setViolation(result.error.message);
      setShowMeterReplace(result.error.kind === 'ValidationError');
      return;
    }
    showToast('Odometer updated');
    router.back();
  };

  const handleMeterReplace = () => {
    const result = OdometerService.replaceMeter(activeBike.id, Number(reading), todayIso());
    if (result.ok) {
      showToast('Odometer updated');
      router.back();
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Update odometer" />
      <Text style={styles.caption}>{formatOdometerReference(snapshot, strings)}</Text>
      <OdoInput value={reading} onChange={setReading} lastReadingKm={activeBike.currentOdometerKm} />
      {violation !== undefined ? <Text style={styles.error}>{violation}</Text> : null}
      <PrimaryButton label="Save" onPress={handleSave} disabled={reading === ''} />
      {showMeterReplace ? (
        <>
          <SecondaryButton label="A past entry is wrong" onPress={() => router.push('/odometer/log')} />
          <SecondaryButton label="The odometer/meter was replaced" onPress={handleMeterReplace} />
        </>
      ) : null}
    </Screen>
  );
}
