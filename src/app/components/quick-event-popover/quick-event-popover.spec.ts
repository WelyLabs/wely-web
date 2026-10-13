import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QuickEventPopoverComponent, toDateValue, toTimeValue, withDate, withTime } from './quick-event-popover';
import { BreakpointObserver } from '@angular/cdk/layout';
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

    it('template_shouldBeADialog', () => {
        const card: HTMLElement = fixture.nativeElement.querySelector('.dialog-card');

        expect(card.getAttribute('role')).toBe('dialog');
        expect(card.getAttribute('aria-modal')).toBe('true');
    });
});

describe('QuickEventPopoverComponent on a wide screen', () => {
    it('template_shouldUseTwoColumns_andShowEveryOptionWithoutFolding', async () => {
        TestBed.resetTestingModule();
        await TestBed.configureTestingModule({
            imports: [QuickEventPopoverComponent, NoopAnimationsModule],
            providers: [
                { provide: EventService, useValue: { findFreeSlots: vi.fn().mockReturnValue(of([])) } },
                { provide: SocialService, useValue: { listFriends: vi.fn().mockReturnValue(of([])) } },
                { provide: BreakpointObserver, useValue: { observe: () => of({ matches: true, breakpoints: {} }) } }
            ]
        }).compileComponents();
        const fixture = TestBed.createComponent(QuickEventPopoverComponent);
        fixture.componentRef.setInput('data', {
            title: '', location: '', startDate: new Date(2026, 9, 16, 19), endDate: new Date(2026, 9, 16, 20),
            description: '', subscribeByDefault: false
        });
        fixture.detectChanges();
        const el: HTMLElement = fixture.nativeElement;

        expect(el.querySelector('.dialog-card')?.classList).toContain('wide');
        expect(el.querySelector('#quick-event-notes')).not.toBeNull();
        expect(el.querySelector('.more-options-toggle')).toBeNull();
    });
});
