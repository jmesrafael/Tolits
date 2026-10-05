/**
 * Where a tapped reminder should land. The planner's key is
 * `${sourceType}:${sourceId}:${notificationType}:${fireDateIso}`, and none of
 * its parts contain ':' (ids are UUIDs, dates are YYYY-MM-DD), so the first two
 * segments identify the record.
 */

export const REMINDERS_ROUTE = '/reminders';

export function routeForNotificationKey(key: unknown): string {
  if (typeof key !== 'string') {
    return REMINDERS_ROUTE;
  }
  const [sourceType, sourceId] = key.split(':');
  if (sourceId === undefined || sourceId === '') {
    return REMINDERS_ROUTE;
  }
  const id = encodeURIComponent(sourceId);
  if (sourceType === 'schedule') {
    return `/maintenance/component/${id}`;
  }
  if (sourceType === 'document') {
    return `/documents/${id}`;
  }
  return REMINDERS_ROUTE;
}
