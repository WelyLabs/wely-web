import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CalendarOverlayComponent } from './calendar-overlay';
import { FriendBlock } from './overlay-layout';

describe('CalendarOverlayComponent', () => {
    let fixture: ComponentFixture<CalendarOverlayComponent>;

    const block = (overrides: Partial<FriendBlock> = {}): FriendBlock => ({
        top: 120, height: 40, left: 50, width: 50, color: '#f97316', friendName: 'lea',
        title: 'Poterie', location: null, owner: null, ...overrides
    });

    beforeEach(async () => {
        await TestBed.configureTestingModule({ imports: [CalendarOverlayComponent] }).compileComponents();
        fixture = TestBed.createComponent(CalendarOverlayComponent);
    });

    const blocks = () => Array.from(fixture.nativeElement.querySelectorAll('.friend-block')) as HTMLElement[];

    it('blocks_shouldBePlacedInTheirLane', () => {
        fixture.componentRef.setInput('blocks', [block()]);
        fixture.detectChanges();
        const [placed] = blocks();

        expect(placed.style.top).toBe('120px');
        expect(placed.style.height).toBe('40px');
        expect(placed.style.left).toBe('50%');
        expect(placed.style.width).toBe('50%');
        expect(placed.style.getPropertyValue('--lane-color')).toBe('#f97316');
        expect(placed.textContent?.trim()).toBe('Poterie');
    });

    it('blocks_shouldNameTheirOwner_inASharedLane', () => {
        fixture.componentRef.setInput('blocks', [block({ owner: 'lea', title: null })]);
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('.friend-block-owner').textContent).toBe('lea');
        expect(blocks()[0].textContent).toContain('Occupé');
    });

    it('blocks_shouldReadBusy_whenNothingIsDisclosed', () => {
        fixture.componentRef.setInput('blocks', [block({ title: null })]);
        fixture.detectChanges();

        expect(blocks()[0].textContent?.trim()).toBe('Occupé');
        expect(blocks()[0].classList).toContain('busy');
    });

    it('blocks_shouldShowTheLocation_whenDisclosed', () => {
        fixture.componentRef.setInput('blocks', [block({ title: 'Théâtre', location: 'Célestins' })]);
        fixture.detectChanges();

        expect(blocks()[0].querySelector('.friend-block-location')?.textContent).toBe('Célestins');
    });

    it('free_shouldDrawEachCommonFreeBand', () => {
        fixture.componentRef.setInput('free', [{ top: 0, height: 80 }, { top: 400, height: 160 }]);
        fixture.detectChanges();

        const bands = Array.from(fixture.nativeElement.querySelectorAll('.free-band')) as HTMLElement[];
        expect(bands.map(band => [band.style.top, band.style.height])).toEqual([['0px', '80px'], ['400px', '160px']]);
    });
});
