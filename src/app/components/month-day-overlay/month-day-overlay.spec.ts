import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MonthDayOverlayComponent } from './month-day-overlay';
import { DaySummary } from '../calendar-overlay/overlay-layout';

describe('MonthDayOverlayComponent', () => {
    let fixture: ComponentFixture<MonthDayOverlayComponent>;
    let component: MonthDayOverlayComponent;

    const summary = (overrides: Partial<DaySummary> = {}): DaySummary => ({
        loads: [{ friendName: 'lea', color: '#a855f7', ratio: 1 / 3 }],
        commonFree: { start: new Date(2026, 9, 14, 19), end: new Date(2026, 9, 14, 23) },
        ...overrides
    });

    beforeEach(async () => {
        await TestBed.configureTestingModule({ imports: [MonthDayOverlayComponent] }).compileComponents();
        fixture = TestBed.createComponent(MonthDayOverlayComponent);
        component = fixture.componentInstance;
    });

    const render = (value: DaySummary) => {
        fixture.componentRef.setInput('summary', value);
        fixture.detectChanges();
        return fixture.nativeElement as HTMLElement;
    };

    it('template_shouldFillEachFriendsBarByHowBusyTheyAre', () => {
        const fill = render(summary()).querySelector('.fill') as HTMLElement;

        expect(parseFloat(fill.style.width)).toBeCloseTo(33.33, 1);
        expect(fill.style.background).toContain('168, 85, 247');
    });

    it('loadLabel_shouldSayWhoAndHowMuch', () => {
        expect(component.loadLabel({ friendName: 'lea', color: '#a', ratio: 1 / 3 })).toBe('lea : occupé 33 % de 8 h à 23 h');
    });

    it('template_shouldShowTheCommonFreeStretch', () => {
        const pill = render(summary()).querySelector('.free-pill') as HTMLElement;

        expect(pill.textContent?.trim()).toBe('19–23 h');
        expect(pill.title).toBe('Tous libres de 19:00 à 23:00');
    });

    it('template_shouldShowNoPill_withoutTwoHoursFreeTogether', () => {
        expect(render(summary({ commonFree: null })).querySelector('.free-pill')).toBeNull();
    });

    it('template_shouldShowNoBars_withoutOverlaidFriends', () => {
        expect(render(summary({ loads: [] })).querySelector('.loads')).toBeNull();
    });

    it('onOpen_shouldOpenTheDayWithoutReachingTheCell', () => {
        const opened = vi.fn();
        component.openDay.subscribe(opened);
        const cellClick = vi.fn();
        const host = render(summary());
        host.addEventListener('click', cellClick);

        (host.querySelector('.free-pill') as HTMLButtonElement).click();

        expect(opened).toHaveBeenCalled();
        expect(cellClick).not.toHaveBeenCalled();
    });
});
