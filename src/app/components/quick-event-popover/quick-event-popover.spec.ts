import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QuickEventPopoverComponent, clampDelta } from './quick-event-popover';
import { EventCreateRequest } from '../../services/event.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { EventService } from '../../services/event.service';
import { SocialService } from '../../services/social.service';

describe('QuickEventPopoverComponent', () => {
    let component: QuickEventPopoverComponent;
    let fixture: ComponentFixture<QuickEventPopoverComponent>;

    const startDate = new Date('2025-06-01T10:00:00Z');
    const endDate = new Date('2025-06-01T11:00:00Z');

    const request = (): EventCreateRequest => ({
        title: '',
        location: '',
        startDate,
        endDate,
        description: '',
        subscribeByDefault: true
    });

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [QuickEventPopoverComponent, NoopAnimationsModule],
            providers: [
                { provide: EventService, useValue: { findFreeSlots: vi.fn().mockReturnValue(of([])) } },
                { provide: SocialService, useValue: { listFriends: vi.fn().mockReturnValue(of([])) } }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(QuickEventPopoverComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('data', request());
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should start from a copy of the incoming request', () => {
        expect(component.draft()).toEqual(request());
    });

    it('should not write through to the object it was handed', () => {
        // The reason this component owns a draft at all: [(ngModel)]="data.title" used to mutate
        // the parent's own popoverData as the user typed, so a dismissed popover left its edits
        // behind on the next open.
        const incoming = request();
        fixture.componentRef.setInput('data', incoming);

        component.update('title', 'Standup');

        expect(incoming.title).toBe('');
        expect(component.draft().title).toBe('Standup');
    });

    it('should reset the draft when a new slot is opened', () => {
        component.update('title', 'Abandoned');

        fixture.componentRef.setInput('data', { ...request(), title: 'Prefilled' });

        expect(component.draft().title).toBe('Prefilled');
    });

    it('should update each editable field', () => {
        component.update('location', 'Room 2');
        component.update('description', 'Weekly sync');
        component.update('subscribeByDefault', false);

        expect(component.draft().location).toBe('Room 2');
        expect(component.draft().description).toBe('Weekly sync');
        expect(component.draft().subscribeByDefault).toBe(false);
    });

    it('should emit the draft on save', () => {
        const emitted: EventCreateRequest[] = [];
        component.save.subscribe(value => emitted.push(value));
        component.update('title', 'Standup');

        component.onSave();

        expect(emitted).toHaveLength(1);
        expect(emitted[0].title).toBe('Standup');
        expect(emitted[0].startDate).toBe(startDate);
    });

    it('should refuse to save an event with no title', () => {
        const emit = vi.fn();
        component.save.subscribe(emit);

        component.onSave();

        expect(emit).not.toHaveBeenCalled();
    });

    it('should emit dismissed on cancel', () => {
        const emit = vi.fn();
        component.dismissed.subscribe(emit);

        component.onCancel();

        expect(emit).toHaveBeenCalled();
    });

    it('should default the position to a top arrow at the centre', () => {
        expect(component.position()).toEqual({ x: 0, y: 0, arrowSide: 'top' });
        expect(component.arrowOffset()).toBe(50);
        expect(component.isMobile()).toBe(false);
    });

    describe('finding a slot with friends', () => {
        it('searchWindow_shouldBeTheSlotThePopoverWasOpenedOn', () => {
            expect(component.searchWindow()).toEqual({ start: startDate, end: endDate });
        });

        it('searchWindow_shouldBeNull_whenTheSlotHasNoEnd', () => {
            fixture.componentRef.setInput('data', { ...request(), endDate: undefined });

            expect(component.searchWindow()).toBeNull();
        });

        it('toggleFindSlot_shouldShowThenHideThePanel', () => {
            component.toggleFindSlot();
            fixture.detectChanges();
            expect(fixture.nativeElement.querySelector('app-find-slot')).not.toBeNull();

            component.toggleFindSlot();
            fixture.detectChanges();
            expect(fixture.nativeElement.querySelector('app-find-slot')).toBeNull();
        });

        it('findingSlot_shouldCloseWhenANewSlotIsOpened', () => {
            component.toggleFindSlot();

            fixture.componentRef.setInput('data', request());

            expect(component.findingSlot()).toBe(false);
        });

        it('onSlotPicked_shouldMoveTheDraftAndCloseThePanel', () => {
            const slot = { start: new Date('2025-06-01T14:00:00Z'), end: new Date('2025-06-01T15:30:00Z') };
            component.update('title', 'Board games');
            component.toggleFindSlot();

            component.onSlotPicked(slot);

            expect(component.draft()).toMatchObject({ title: 'Board games', startDate: slot.start, endDate: slot.end });
            expect(component.findingSlot()).toBe(false);
        });

        it('onSlotPicked_shouldKeepTheSearchWindow', () => {
            component.onSlotPicked({ start: new Date('2025-06-01T10:15:00Z'), end: new Date('2025-06-01T10:45:00Z') });

            expect(component.searchWindow()).toEqual({ start: startDate, end: endDate });
        });
    });

    describe('spansSeveralDays', () => {
        it('should be false for a slot within one day', () => {
            expect(component.spansSeveralDays()).toBe(false);
        });

        it('should be true when the draft ends on another day', () => {
            fixture.componentRef.setInput('data', { ...request(), endDate: new Date('2025-06-03T11:00:00Z') });

            expect(component.spansSeveralDays()).toBe(true);
        });
    });

    describe('dragging', () => {
        const card = () => fixture.nativeElement.querySelector('.popover-container') as HTMLElement;

        const pointer = (overrides: Partial<Record<string, unknown>>) => ({
            button: 0,
            pointerId: 1,
            clientX: 0,
            clientY: 0,
            target: card(),
            currentTarget: card(),
            preventDefault: vi.fn(),
            ...overrides
        }) as unknown as PointerEvent;

        beforeEach(() => {
            vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000);
            vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
            vi.spyOn(card(), 'getBoundingClientRect').mockReturnValue(
                { left: 100, right: 420, top: 100, bottom: 500, width: 320, height: 400, x: 100, y: 100 } as DOMRect);
        });

        it('clampDelta_shouldKeepTheMoveInsideTheRoomOnEachSide', () => {
            expect(clampDelta(50, 100, 200)).toBe(50);
            expect(clampDelta(-150, 100, 200)).toBe(-100);
            expect(clampDelta(300, 100, 200)).toBe(200);
        });

        it('clampDelta_shouldPullBackAPopoverThatOverflows', () => {
            expect(clampDelta(10, 100, -40)).toBe(-40);
        });

        it('onPointerMove_shouldFollowThePointer', () => {
            component.onPointerDown(pointer({ clientX: 200, clientY: 200 }));
            component.onPointerMove(pointer({ clientX: 260, clientY: 150 }));

            expect(component.offset()).toEqual({ x: 60, y: -50 });
            expect(component.moved()).toBe(true);
            expect(component.dragging()).toBe(true);
        });

        it('onPointerMove_shouldStopAtTheEdgeOfTheScreen', () => {
            component.onPointerDown(pointer({ clientX: 200, clientY: 200 }));
            component.onPointerMove(pointer({ clientX: 2000, clientY: -500 }));

            expect(component.offset()).toEqual({ x: 580, y: -100 });
        });

        it('onPointerMove_shouldDoNothing_withoutAPressFirst', () => {
            component.onPointerMove(pointer({ clientX: 260, clientY: 150 }));

            expect(component.moved()).toBe(false);
        });

        it('onPointerDown_shouldLeaveFieldsAndButtonsAlone', () => {
            const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
            const press = pointer({ target: input });

            component.onPointerDown(press);
            component.onPointerMove(pointer({ clientX: 100, clientY: 100 }));

            expect(press.preventDefault).not.toHaveBeenCalled();
            expect(component.moved()).toBe(false);
        });

        it('onPointerDown_shouldIgnoreOtherButtons', () => {
            component.onPointerDown(pointer({ button: 2 }));

            expect(component.dragging()).toBe(false);
        });

        it('onPointerUp_shouldEndTheDragAndKeepThePosition', () => {
            component.onPointerDown(pointer({ clientX: 200, clientY: 200 }));
            component.onPointerMove(pointer({ clientX: 230, clientY: 200 }));

            component.onPointerUp(pointer({}));
            component.onPointerMove(pointer({ clientX: 400, clientY: 400 }));

            expect(component.dragging()).toBe(false);
            expect(component.offset()).toEqual({ x: 30, y: 0 });
        });

        it('onPointerUp_shouldIgnoreAnotherPointer', () => {
            component.onPointerDown(pointer({}));

            component.onPointerUp(pointer({ pointerId: 2 }));

            expect(component.dragging()).toBe(true);
        });

        it('offset_shouldResetWhenANewSlotIsOpened', () => {
            component.onPointerDown(pointer({ clientX: 200, clientY: 200 }));
            component.onPointerMove(pointer({ clientX: 260, clientY: 150 }));

            fixture.componentRef.setInput('data', request());

            expect(component.offset()).toEqual({ x: 0, y: 0 });
        });

        it('template_shouldHideTheArrowOnceMoved', () => {
            component.onPointerDown(pointer({ clientX: 200, clientY: 200 }));
            component.onPointerMove(pointer({ clientX: 260, clientY: 150 }));
            fixture.detectChanges();

            expect(card().classList).toContain('moved');
            expect(card().style.translate).toBe('60px -50px');
        });
    });
});
