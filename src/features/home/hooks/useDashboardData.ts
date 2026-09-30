import { useMemo } from 'react';

import { DocumentRepository } from '@/db/repositories/DocumentRepository';
import { ExpenseRepository } from '@/db/repositories/ExpenseRepository';
import { componentIcon, componentLabel } from '@/features/maintenance/componentMeta';
import { useSchedules } from '@/features/maintenance/hooks/useSchedules';
import { formatRemaining } from '@/features/maintenance/remainingText';
import { useActiveBike } from '@/hooks/useActiveBike';
import { strings } from '@/i18n/strings';
import { addDays } from '@/lib/dates';
import { formatCategoryName, formatFullDate, formatMoney } from '@/lib/format';
import { formatTimelineTitle, loadTimeline } from '@/services/TimelineService';
import type { ChartTokens } from '@/theme/types';
import type {
  ActivityKind,
  ActivityVm,
  DashboardData,
  HealthBandId,
  MonthCategoryVm,
} from '@/types/domain';
import type { ComponentType, DocType } from '@/types/enums';

export interface DashboardVm {
  data: DashboardData | null;
  greeting: string;
  dateLabel: string;
  bandId: HealthBandId | null;
  bandLabel: string;
  attentionCount: number;
  hasBike: boolean;
}

const CHART_SLOTS: (keyof ChartTokens)[] = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5'];

function timelineKindToActivityKind(kind: string): ActivityKind {
  return kind === 'fuel' ? 'fuel' : kind === 'repair' ? 'repair' : 'maintenance';
}

/** Live dashboard view model (replaces the fixture — DATA_FLOW.md §2). */
export function useDashboardData(): DashboardVm {
  const { activeBike, ready: garageReady } = useActiveBike();
  const { items, health, healthIsEstimated, odometer, today } = useSchedules(activeBike?.id ?? null);

  return useMemo(() => {
    const hour = new Date().getHours();
    const greeting =
      hour < 12
        ? strings.dashboard.greeting.morning
        : hour < 18
          ? strings.dashboard.greeting.afternoon
          : strings.dashboard.greeting.evening;

    if (!garageReady || activeBike === null) {
      return {
        data: null,
        greeting,
        dateLabel: formatFullDate(new Date()),
        bandId: null,
        bandLabel: '',
        attentionCount: 0,
        hasBike: activeBike !== null,
      };
    }

    const score = health?.score ?? null;
    const bandId: HealthBandId | null = health?.band ?? null;
    const bandLabel = bandId !== null ? strings.dashboard.band[bandId] : 'Finish setup';

    // Km statuses were computed from the estimate when one exists — label them so.
    const estimated = odometer?.statusIsEstimate ?? false;
    const upcoming = [...items]
      .filter((i) => i.status.status !== 'neutral')
      .sort((a, b) => (b.status.ratio ?? 0) - (a.status.ratio ?? 0))
      .slice(0, 5)
      .map((i) => {
        const componentType = i.schedule.componentType as ComponentType;
        return {
          id: i.schedule.id,
          icon: componentIcon(componentType),
          label: componentLabel(componentType, i.schedule.customName),
          status: i.status.status,
          remainingText: formatRemaining(i.status, estimated),
        };
      });

    const soon = addDays(today, 30);
    const expiring = DocumentRepository.listExpiringBy(soon).find(
      (d) => d.motorcycleId === activeBike.id || d.motorcycleId === null,
    );
    const documentWarning =
      expiring !== undefined
        ? {
            id: expiring.id,
            message:
              expiring.expiryDate !== null && expiring.expiryDate < today
                ? `${strings.docTypes[expiring.docType as DocType]} expired`
                : `${strings.docTypes[expiring.docType as DocType]} expires ${expiring.expiryDate ?? ''}`,
          }
        : undefined;

    const timelineRows = loadTimeline(activeBike.id, { scope: 'all', limit: 5 });
    const activity: ActivityVm[] = timelineRows.map((entry) => ({
      id: entry.id,
      kind: timelineKindToActivityKind(entry.kind),
      icon:
        entry.componentType !== null
          ? componentIcon(entry.componentType)
          : entry.kind === 'fuel'
            ? 'fuel'
            : entry.kind === 'repair'
              ? 'repair'
              : 'maintenance',
      title: formatTimelineTitle(entry),
      dateIso: entry.date,
      ...(entry.odometerKm !== null ? { odometerKm: entry.odometerKm } : {}),
      amountCentavos: entry.amountCentavos ?? 0,
    }));

    const monthKeyStr = today.slice(0, 7);
    const categoryTotals = ExpenseRepository.categoryTotals({
      motorcycleId: activeBike.id,
      month: monthKeyStr,
    });
    const monthTotal = categoryTotals.reduce((sum, c) => sum + c.totalCentavos, 0);
    const categories: MonthCategoryVm[] = categoryTotals.slice(0, 5).map((c, index) => ({
      id: c.category,
      label: formatCategoryName(c.category),
      amountCentavos: c.totalCentavos,
      slot: (CHART_SLOTS[index] ?? 'other') as MonthCategoryVm['slot'],
    }));

    const data: DashboardData = {
      bike: {
        id: activeBike.id,
        nickname: activeBike.nickname,
        brand: activeBike.brand,
        model: activeBike.model,
        plate: activeBike.plateNumber ?? '',
        odometerKm: odometer?.actualKm ?? activeBike.currentOdometerKm,
        odometerAsOf: odometer?.actualDate ?? null,
        estimatedOdometerKm: odometer?.estimatedKm ?? null,
        estimateIsRough: odometer?.rate.confidence === 'low',
        needsMoreReadings: odometer?.needsMoreReadings ?? false,
      },
      healthScore: score,
      isPartialScore: health?.isPartial ?? false,
      isEstimatedScore: healthIsEstimated,
      upcoming,
      ...(documentWarning !== undefined ? { documentWarning } : {}),
      activity,
      month: {
        label: new Date().toLocaleString('en-PH', { month: 'long' }),
        totalCentavos: monthTotal,
        deltaCaption: formatMoney(monthTotal),
        categories,
      },
    };

    return {
      data,
      greeting,
      dateLabel: formatFullDate(new Date()),
      bandId,
      bandLabel,
      attentionCount: upcoming.filter((s) => s.status === 'dueSoon' || s.status === 'overdue').length,
      hasBike: true,
    };
  }, [garageReady, activeBike, items, health, healthIsEstimated, odometer, today]);
}
