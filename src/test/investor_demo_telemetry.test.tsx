// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useListingTelemetry } from '../../hooks/useListingTelemetry';

afterEach(() => vi.unstubAllGlobals());

describe('investor concept telemetry isolation', () => {
  it('never posts photo or date intent for a demo detail view', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useListingTelemetry('encho-prop-01', false));
    act(() => {
      result.current.trackPhotoView(1);
      result.current.trackDateSelection('2026-10-01', '2026-10-03');
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
