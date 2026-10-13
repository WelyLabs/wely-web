import { HttpErrorResponse } from '@angular/common/http';
import { describe, it, expect } from 'vitest';
import { eventMediaError } from './event-media-errors';

describe('eventMediaError', () => {
  const refusal = (code: string, status: number) => new HttpErrorResponse({ status, error: { code } });

  it('eventMediaError_shouldExplainEachKnownCode', () => {
    expect(eventMediaError(refusal('EVT-BUS-011', 400), 'x')).toContain('pas une image utilisable');
    expect(eventMediaError(refusal('EVT-BUS-012', 413), 'x')).toContain('trop lourde');
    expect(eventMediaError(refusal('EVT-BUS-013', 400), 'x')).toContain('ticket');
    expect(eventMediaError(refusal('EVT-TEC-003', 502), 'x')).toContain('indisponibles');
    expect(eventMediaError(refusal('EVT-BUS-002', 403), 'x')).toContain('organisateur');
  });

  it('eventMediaError_shouldFallBack_forAnUnknownCodeOrAnotherError', () => {
    expect(eventMediaError(refusal('EVT-BUS-999', 400), 'fallback')).toBe('fallback');
    expect(eventMediaError(new HttpErrorResponse({ status: 0 }), 'fallback')).toBe('fallback');
    expect(eventMediaError(new Error('boom'), 'fallback')).toBe('fallback');
  });
});
