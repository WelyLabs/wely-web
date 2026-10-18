import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CELEBRATION_MS, CelebrationService } from './celebration.service';

describe('CelebrationService', () => {
    let service: CelebrationService;

    beforeEach(() => {
        vi.useFakeTimers();
        TestBed.resetTestingModule();
        service = TestBed.inject(CelebrationService);
    });

    afterEach(() => vi.useRealTimers());

    it('celebrateCloseness_shouldShowTheNewLevel_thenGoAway', () => {
        service.celebrateCloseness('Léa', 'INTIMATE');

        expect(service.closeness()).toMatchObject({ name: 'Léa', closeness: 'INTIMATE' });
        vi.advanceTimersByTime(CELEBRATION_MS);
        expect(service.closeness()).toBeNull();
    });

    it('celebrateCloseness_shouldReplaceTheLastOne_andRestartItsTime', () => {
        service.celebrateCloseness('Léa', 'CLOSE');
        const first = service.closeness()?.id;
        vi.advanceTimersByTime(CELEBRATION_MS - 100);

        service.celebrateCloseness('Hugo', 'INTIMATE');
        vi.advanceTimersByTime(200);

        expect(service.closeness()).toMatchObject({ name: 'Hugo' });
        expect(service.closeness()?.id).not.toBe(first);
    });

    it('celebrateCloseness_shouldIgnoreTheLowestLevel', () => {
        service.celebrateCloseness('Léa', 'FRIEND');
        service.celebrateCloseness('Léa', null);

        expect(service.closeness()).toBeNull();
    });

    it('dismiss_shouldCloseAtOnce', () => {
        service.celebrateCloseness('Léa', 'CLOSE');

        service.dismiss();

        expect(service.closeness()).toBeNull();
    });
});
