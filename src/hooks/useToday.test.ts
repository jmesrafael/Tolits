import { createElement } from 'react';
import { AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useToday } from './useToday';

type Listener = (state: string) => void;

let appStateListener: Listener | null = null;
const remove = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 7, 11, 23, 59, 0));
  appStateListener = null;
  remove.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, listener: Listener) => {
    appStateListener = listener;
    return { remove };
  }) as unknown as typeof AppState.addEventListener);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function renderProbe(): { rendered: string[]; renderer: ReactTestRenderer } {
  const rendered: string[] = [];
  function Probe() {
    rendered.push(useToday());
    return null;
  }
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(Probe));
  });
  return { rendered, renderer };
}

describe('useToday', () => {
  test('re-renders with the new date at midnight while mounted', () => {
    const { rendered, renderer } = renderProbe();
    expect(rendered.at(-1)).toBe('2026-08-11');
    act(() => {
      jest.advanceTimersByTime(62_000);
    });
    expect(rendered.at(-1)).toBe('2026-08-12');
    act(() => renderer.unmount());
  });

  test('re-checks on returning to the app (timers do not run while the phone sleeps)', () => {
    const { rendered, renderer } = renderProbe();
    jest.setSystemTime(new Date(2026, 7, 13, 8, 0, 0));
    act(() => {
      appStateListener?.('background');
    });
    expect(rendered.at(-1)).toBe('2026-08-11');
    act(() => {
      appStateListener?.('active');
    });
    expect(rendered.at(-1)).toBe('2026-08-13');
    act(() => renderer.unmount());
  });

  test('unmount removes the timer and the AppState listener (no leaks)', () => {
    const { renderer } = renderProbe();
    expect(jest.getTimerCount()).toBe(1);
    act(() => renderer.unmount());
    expect(jest.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test('no re-render during the day (no polling)', () => {
    const { rendered, renderer } = renderProbe();
    const count = rendered.length;
    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(rendered.length).toBe(count);
    act(() => renderer.unmount());
  });
});
