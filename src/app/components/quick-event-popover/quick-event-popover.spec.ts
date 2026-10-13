import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QuickEventPopoverComponent, clampDelta, toDateValue, toTimeValue, upwardShift, withDate, withTime } from './quick-event-popover';
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

    describe('picking the location on a map', () => {
        const place = { label: 'Le Transbordeur, Villeurbanne', coordinates: { latitude: 45.784, longitude: 4.8608 } };

        it('toggleLocationPicker_shouldShowThenHideTheMap', () => {
            component.toggleLocationPicker();
            expect(component.pickingLocation()).toBe(true);

            component.toggleLocationPicker();
            expect(component.pickingLocation()).toBe(false);
        });

        it('pickingLocation_shouldCloseWhenANewSlotIsOpened', () => {
            component.toggleLocationPicker();

            fixture.componentRef.setInput('data', request());

            expect(component.pickingLocation()).toBe(false);
        });

        it('onPlacePicked_shouldFillTheLocationAndKeepThePoint', () => {
            component.onPlacePicked(place);

            expect(component.draft()).toMatchObject({ location: place.label, coordinates: place.coordinates });
            expect(component.pickedPlace()).toEqual(place);
        });

        it('pickedPlace_shouldBeNullForATypedLocation', () => {
            component.update('location', 'Chez moi');

            expect(component.pickedPlace()).toBeNull();
        });

        it('onSave_shouldSendTheCoordinates', () => {
            const saved = vi.fn();
            component.save.subscribe(saved);
            component.update('title', 'Concert');
            component.onPlacePicked(place);

            component.onSave();

            expect(saved).toHaveBeenCalledWith(expect.objectContaining({ coordinates: place.coordinates }));
        });

        it('onPointerDown_shouldLeaveTheMapItsOwnDrag', () => {
            const map = document.createElement('div');
            map.className = 'location-map';
            const event = { button: 0, target: map, preventDefault: vi.fn() } as unknown as PointerEvent;

            component.onPointerDown(event);

            expect(component.dragging()).toBe(false);
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

    describe('visibility', () => {
        it('visibility_shouldDefaultToFriends', () => {
            expect(component.visibility()).toBe('FRIENDS');
            expect(component.visibilityHint()).toContain('amis');
        });

        it('update_shouldCarryTheChosenVisibilityIntoTheSavedDraft', () => {
            const emitted: EventCreateRequest[] = [];
            component.save.subscribe(value => emitted.push(value));
            component.update('title', 'Secret');

            component.update('visibility', 'PRIVATE');
            component.onSave();

            expect(component.visibility()).toBe('PRIVATE');
            expect(emitted[0].visibility).toBe('PRIVATE');
        });

        it('template_shouldMarkTheActiveChoice', () => {
            component.update('visibility', 'PUBLIC');
            fixture.detectChanges();

            const active = fixture.nativeElement.querySelector('.visibility-chip.active') as HTMLElement;
            expect(active.textContent).toContain('Public');
        });
    });

    describe('staying on screen', () => {
        const card = () => fixture.nativeElement.querySelector('.popover-container') as HTMLElement;
        const placeCard = (top: number, bottom: number) => vi.spyOn(card(), 'getBoundingClientRect')
            .mockReturnValue({ top, bottom, left: 100, right: 420, width: 320, height: bottom - top, x: 100, y: top } as DOMRect);

        beforeEach(() => {
            vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
        });

        it('upwardShift_shouldBeZero_whenTheBoxFits', () => {
            expect(upwardShift(100, 700, 800)).toBe(0);
        });

        it('upwardShift_shouldLiftTheBottomAboveTheEdge', () => {
            expect(upwardShift(300, 900, 800)).toBe(108);
        });

        it('upwardShift_shouldNeverLiftTheTopPastTheMargin', () => {
            expect(upwardShift(50, 1200, 800)).toBe(42);
        });

        it('keepOnScreen_shouldMoveTheCardUp_whenItGrowsPastTheBottom', () => {
            placeCard(300, 900);

            component.keepOnScreen();

            expect(component.offset()).toEqual({ x: 0, y: -108 });
        });

        it('keepOnScreen_shouldLeaveACardThatFits', () => {
            placeCard(100, 500);

            component.keepOnScreen();

            expect(component.offset()).toEqual({ x: 0, y: 0 });
        });

        it('keepOnScreen_shouldLeaveTheCentredPhoneLayoutAlone', () => {
            fixture.componentRef.setInput('isMobile', true);
            placeCard(300, 900);

            component.keepOnScreen();

            expect(component.offset()).toEqual({ x: 0, y: 0 });
        });
    });

    describe('date and time fields', () => {
        const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);
        const open = (start: Date, end: Date) => {
            fixture.componentRef.setInput('data', { ...request(), startDate: start, endDate: end });
            fixture.detectChanges();
        };

        it('toDateValue_shouldGiveTheLocalDay', () => {
            expect(toDateValue(at(4, 23, 30))).toBe('2026-10-04');
        });

        it('toTimeValue_shouldPadHoursAndMinutes', () => {
            expect(toTimeValue(at(4, 9, 5))).toBe('09:05');
        });

        it('withDate_shouldKeepTheTimeOfDay', () => {
            expect(withDate(at(4, 19, 15), '2026-11-02')).toEqual(new Date(2026, 10, 2, 19, 15));
        });

        it('withDate_shouldBeNull_whenTheFieldIsCleared', () => {
            expect(withDate(at(4, 19), '')).toBeNull();
        });

        it('withTime_shouldKeepTheDay', () => {
            expect(withTime(at(4, 19), '07:45')).toEqual(at(4, 7, 45));
        });

        it('withTime_shouldBeNull_whenTheFieldIsCleared', () => {
            expect(withTime(at(4, 19), '')).toBeNull();
        });

        it('startDay_andTimes_shouldShowTheDraft', () => {
            open(at(16, 19), at(16, 21, 30));

            expect(component.startDay()).toBe('2026-10-16');
            expect(component.startTime()).toBe('19:00');
            expect(component.endTime()).toBe('21:30');
        });

        it('onStartChange_shouldMoveTheWholeEvent_keepingItsDuration', () => {
            open(at(16, 19), at(16, 21));

            component.onStartChange('time', '20:30');

            expect(component.draft().startDate).toEqual(at(16, 20, 30));
            expect(component.draft().endDate).toEqual(at(16, 22, 30));
        });

        it('onStartChange_shouldMoveTheEventToAnotherDay', () => {
            open(at(16, 19), at(16, 21));

            component.onStartChange('date', '2026-10-18');

            expect(component.draft().startDate).toEqual(at(18, 19));
            expect(component.draft().endDate).toEqual(at(18, 21));
        });

        it('onStartChange_shouldIgnoreAClearedField', () => {
            open(at(16, 19), at(16, 21));

            component.onStartChange('time', '');

            expect(component.draft().startDate).toEqual(at(16, 19));
        });

        it('onEndChange_shouldSetTheEndTheSameDay', () => {
            open(at(16, 19), at(16, 20));

            component.onEndChange('time', '23:00');

            expect(component.draft().endDate).toEqual(at(16, 23));
        });

        it('onEndChange_shouldReadAnEarlierTimeAsTheNextMorning', () => {
            open(at(16, 22), at(16, 23));

            component.onEndChange('time', '02:00');

            expect(component.draft().endDate).toEqual(at(17, 2));
            expect(component.spansSeveralDays()).toBe(true);
        });

        it('onEndChange_shouldBringAMultiDayEndBackToTheStartDay_whenThatStillFollowsTheStart', () => {
            open(at(16, 18), at(17, 2));

            component.onEndChange('date', '2026-10-16');
            component.onEndChange('time', '23:00');

            expect(component.draft().endDate).toEqual(at(16, 23));
        });

        it('invalidRange_shouldBlockTheSave_whenTheEndIsBeforeTheStart', () => {
            open(at(16, 19), at(16, 21));
            component.update('title', 'Afterwork');
            component.onEndChange('date', '2026-10-15');
            const save = vi.fn();
            component.save.subscribe(save);

            component.onSave();

            expect(component.invalidRange()).toBe(true);
            expect(save).not.toHaveBeenCalled();
        });

        it('template_shouldExplainAnInvalidRange', () => {
            open(at(16, 19), at(16, 19));

            expect(fixture.nativeElement.querySelector('.field-error')?.textContent).toContain('après le début');
        });

        it('template_shouldAskForTheEndDay_onlyForAMultiDayEvent', () => {
            open(at(16, 19), at(16, 21));
            expect(fixture.nativeElement.querySelector('#quick-event-end-day')).toBeNull();

            open(at(16, 22), at(17, 2));
            expect(fixture.nativeElement.querySelector('#quick-event-end-day')).not.toBeNull();
        });
    });

    describe('saving', () => {
        it('onSave_shouldRefuseATitleMadeOfSpaces', () => {
            const save = vi.fn();
            component.save.subscribe(save);
            component.update('title', '   ');

            component.onSave();

            expect(save).not.toHaveBeenCalled();
        });

        it('onSave_shouldNotSendTwice_whileSaving', () => {
            const save = vi.fn();
            component.save.subscribe(save);
            component.update('title', 'Afterwork');
            fixture.componentRef.setInput('saving', true);

            component.onSave();

            expect(save).not.toHaveBeenCalled();
        });

        it('template_shouldShowTheError', () => {
            fixture.componentRef.setInput('error', 'Échec');
            fixture.detectChanges();

            expect(fixture.nativeElement.querySelector('.save-error')?.textContent).toContain('Échec');
        });

        it('template_shouldSayItIsCreating_whileSaving', () => {
            fixture.componentRef.setInput('saving', true);
            fixture.detectChanges();

            expect(fixture.nativeElement.querySelector('.submit-btn').textContent).toContain('Création');
        });
    });

    describe('more options', () => {
        it('toggleMoreOptions_shouldShowThenHideNotesAndSubscription', () => {
            expect(fixture.nativeElement.querySelector('#quick-event-notes')).toBeNull();

            component.toggleMoreOptions();
            fixture.detectChanges();
            expect(fixture.nativeElement.querySelector('#quick-event-notes')).not.toBeNull();

            component.toggleMoreOptions();
            fixture.detectChanges();
            expect(fixture.nativeElement.querySelector('#quick-event-notes')).toBeNull();
        });

        it('showMoreOptions_shouldCloseWhenANewSlotIsOpened', () => {
            component.toggleMoreOptions();

            fixture.componentRef.setInput('data', request());

            expect(component.showMoreOptions()).toBe(false);
        });
    });
});
