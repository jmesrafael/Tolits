import { REMINDERS_ROUTE, routeForNotificationKey } from './notificationRoute';

const SCHEDULE_ID = '6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b';
const DOCUMENT_ID = '0a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d';

describe('routeForNotificationKey', () => {
  test('maintenance reminder opens its component screen', () => {
    expect(routeForNotificationKey(`schedule:${SCHEDULE_ID}:maintenance_due:2026-08-12`)).toBe(
      `/maintenance/component/${SCHEDULE_ID}`,
    );
  });

  test('overdue maintenance reminder opens the same component screen', () => {
    expect(routeForNotificationKey(`schedule:${SCHEDULE_ID}:maintenance_overdue:2026-08-10`)).toBe(
      `/maintenance/component/${SCHEDULE_ID}`,
    );
  });

  test('document expiry reminder opens the document', () => {
    expect(routeForNotificationKey(`document:${DOCUMENT_ID}:document_expiry:2026-09-01`)).toBe(
      `/documents/${DOCUMENT_ID}`,
    );
  });

  test('unknown source type falls back to the reminders list', () => {
    expect(routeForNotificationKey(`system:${SCHEDULE_ID}:backup_reminder:2026-09-01`)).toBe(REMINDERS_ROUTE);
  });

  test.each([undefined, null, 42, '', 'schedule:', 'schedule'])('malformed key %p falls back to reminders', (key) => {
    expect(routeForNotificationKey(key)).toBe(REMINDERS_ROUTE);
  });

  test('an id is never allowed to change the route path', () => {
    const route = routeForNotificationKey('schedule:../../settings:maintenance_due:2026-08-12');
    expect(route).toBe('/maintenance/component/..%2F..%2Fsettings');
  });
});
