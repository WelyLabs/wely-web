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
        it('onEndChange_shouldComeBackToTheStartDay_whenTheTypedTimeEndsLater', () => {
            const day = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);
            fixture.componentRef.setInput('data', { ...request(), startDate: day(22, 19, 30), endDate: day(22, 21, 30) });
            fixture.detectChanges();

            // Typing 10:00 PM goes through 10:00 AM, which is before the start.
            component.onEndChange('time', '10:00');
            expect(component.draft().endDate).toEqual(day(23, 10));
            component.onEndChange('time', '22:00');

            expect(component.draft().endDate).toEqual(day(22, 22));
        });

        it('onEndChange_shouldKeepTheEndDay_ofAnEventLastingSeveralDays', () => {
            const day = (d: number, h: number) => new Date(2026, 9, d, h);
            fixture.componentRef.setInput('data', { ...request(), startDate: day(22, 19), endDate: day(25, 12) });
            fixture.detectChanges();

            component.onEndChange('time', '18:00');

            expect(component.draft().endDate).toEqual(day(25, 18));
        });

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

    describe('date poll', () => {
        const DAY = 86_400_000;
        const shifted = (date: Date, days: number) => new Date(date.getTime() + days * DAY);
        const el = (): HTMLElement => fixture.nativeElement;
        const render = () => fixture.detectChanges();

        beforeEach(() => component.update('title', 'Dîner'));

        describe('opened with proposed slots', () => {
            const slots = [
                { start: new Date('2025-06-02T18:00:00Z'), end: new Date('2025-06-02T20:00:00Z') },
                { start: new Date('2025-06-03T18:30:00Z'), end: new Date('2025-06-03T20:30:00Z') }
            ];
            const open = (candidateSlots: { start: Date; end: Date }[]) => {
                fixture.componentRef.setInput('data', { ...request(), title: 'Sortie avec lea', startDate: slots[0].start,
                    endDate: slots[0].end, candidateSlots });
                fixture.detectChanges();
            };

            it('pollMode_shouldStartOnWithTheProposedSlots', () => {
                open(slots);

                expect(component.pollMode()).toBe(true);
                expect(component.candidates()).toEqual(slots);
                expect(component.selectedSlot()).toBe(0);
                expect(component.draft().title).toBe('Sortie avec lea');
                expect(fixture.nativeElement.querySelectorAll('.slot-item').length).toBe(2);
            });

            it('pollMode_shouldStartOn_withASingleProposedSlot', () => {
                open([slots[0]]);

                expect(component.pollMode()).toBe(true);
                expect(component.candidates()).toEqual([slots[0]]);
                expect(component.tooFewSlots()).toBe(true);
            });

            it('pollMode_shouldStayOff_withAnEmptyList', () => {
                open([]);

                expect(component.pollMode()).toBe(false);
                expect(component.candidates()).toEqual([]);
            });

            it('onSave_shouldSendTheProposedSlotsAsAPoll', () => {
                open(slots);
                const emit = vi.spyOn(component.save, 'emit');

                component.onSave();

                expect(emit).toHaveBeenCalledWith(expect.objectContaining({ candidateSlots: slots, startDate: slots[0].start }));
            });

            it('onSave_shouldSendAPlainEvent_whenThePollWasTurnedOff', () => {
                open(slots);
                const emit = vi.spyOn(component.save, 'emit');

                component.togglePollMode();
                component.onSave();

                expect(emit.mock.calls[0][0].candidateSlots).toBeUndefined();
            });
        });

        it('togglePollMode_shouldMakeTheEditedSlotTheFirstCandidate', () => {
            component.togglePollMode();

            expect(component.pollMode()).toBe(true);
            expect(component.candidates()).toEqual([{ start: startDate, end: endDate }]);
            expect(component.selectedSlot()).toBe(0);
        });

        it('togglePollMode_shouldDropTheCandidates_whenTurnedOff', () => {
            component.togglePollMode();
            component.addSlot();

            component.togglePollMode();

            expect(component.pollMode()).toBe(false);
            expect(component.candidates()).toEqual([]);
        });

        it('addSlot_shouldProposeTheNextDaySameHours_andSelectIt', () => {
            component.togglePollMode();

            component.addSlot();

            expect(component.candidates()[1]).toEqual({ start: shifted(startDate, 1), end: shifted(endDate, 1) });
            expect(component.selectedSlot()).toBe(1);
            expect(component.draft().startDate).toEqual(shifted(startDate, 1));
        });

        it('addSlot_shouldStopAtFiveSlots', () => {
            component.togglePollMode();
            for (let i = 0; i < 6; i++) {
                component.addSlot();
            }

            expect(component.candidates()).toHaveLength(5);
            expect(component.canAddSlot()).toBe(false);
        });

        it('addSlot_shouldDoNothing_outsidePollMode', () => {
            component.addSlot();

            expect(component.candidates()).toEqual([]);
        });

        it('onStartChange_shouldEditTheSelectedSlot_only', () => {
            component.togglePollMode();
            component.addSlot();
            component.selectSlot(0);

            component.onStartChange('time', '08:00');

            const first = component.candidates()[0];
            expect(first.start.getHours()).toBe(8);
            expect(first.end.getTime() - first.start.getTime()).toBe(endDate.getTime() - startDate.getTime());
            expect(component.candidates()[1]).toEqual({ start: shifted(startDate, 1), end: shifted(endDate, 1) });
        });

        it('onEndChange_shouldEditTheSelectedSlot', () => {
            component.togglePollMode();
            component.addSlot();

            component.onEndChange('time', '23:30');

            expect(component.candidates()[1].end.getHours()).toBe(23);
            expect(component.candidates()[1].end.getMinutes()).toBe(30);
        });

        it('selectSlot_shouldLoadTheSlotIntoTheDateFields', () => {
            component.togglePollMode();
            component.addSlot();

            component.selectSlot(0);

            expect(component.draft().startDate).toEqual(startDate);
            expect(component.startDay()).toBe(toDateValue(startDate));
        });

        it('selectSlot_shouldIgnoreAnUnknownIndex', () => {
            component.togglePollMode();

            component.selectSlot(4);

            expect(component.selectedSlot()).toBe(0);
        });

        it('removeSlot_shouldSelectTheNeighbour_whenTheSelectedSlotIsRemoved', () => {
            component.togglePollMode();
            component.addSlot();
            component.addSlot();

            component.removeSlot(2);

            expect(component.candidates()).toHaveLength(2);
            expect(component.selectedSlot()).toBe(1);
            expect(component.draft().startDate).toEqual(shifted(startDate, 1));
        });

        it('removeSlot_shouldKeepTheSelection_whenAnEarlierSlotIsRemoved', () => {
            component.togglePollMode();
            component.addSlot();
            component.addSlot();

            component.removeSlot(0);

            expect(component.selectedSlot()).toBe(1);
            expect(component.candidates()[1]).toEqual({ start: shifted(startDate, 2), end: shifted(endDate, 2) });
        });

        it('removeSlot_shouldKeepTheLastSlot', () => {
            component.togglePollMode();

            component.removeSlot(0);

            expect(component.candidates()).toHaveLength(1);
        });

        it('onSave_shouldEmitTheSlotsEarliestFirst_andStartOnTheEarliest', () => {
            const emitted: EventCreateRequest[] = [];
            component.save.subscribe(request => emitted.push(request));
            component.togglePollMode();
            component.candidates.update(slots => [...slots, { start: shifted(startDate, -1), end: shifted(endDate, -1) }]);

            component.onSave();

            expect(emitted[0].candidateSlots).toEqual([
                { start: shifted(startDate, -1), end: shifted(endDate, -1) },
                { start: startDate, end: endDate }
            ]);
            expect(emitted[0].startDate).toEqual(shifted(startDate, -1));
        });

        it('onSave_shouldRefuse_withFewerThanTwoSlots', () => {
            const emit = vi.spyOn(component.save, 'emit');
            component.togglePollMode();

            component.onSave();

            expect(component.tooFewSlots()).toBe(true);
            expect(emit).not.toHaveBeenCalled();
        });

        it('onSave_shouldRefuse_whenASlotIsProposedTwice', () => {
            const emit = vi.spyOn(component.save, 'emit');
            component.togglePollMode();
            component.candidates.update(slots => [...slots, { start: startDate, end: endDate }]);

            component.onSave();

            expect(component.invalidSlots()).toBe(true);
            expect(emit).not.toHaveBeenCalled();
        });

        it('onSave_shouldNotSendCandidateSlots_outsidePollMode', () => {
            const emitted: EventCreateRequest[] = [];
            component.save.subscribe(request => emitted.push(request));

            component.onSave();

            expect(emitted[0].candidateSlots).toBeUndefined();
        });

        it('pollMode_shouldResetWhenANewSlotIsOpened', () => {
            component.togglePollMode();

            fixture.componentRef.setInput('data', request());

            expect(component.pollMode()).toBe(false);
            expect(component.candidates()).toEqual([]);
        });

        it('template_shouldListTheSlots_andRenameTheButton', () => {
            component.togglePollMode();
            render();
            const submit = () => el().querySelector<HTMLButtonElement>('.submit-btn')!;

            expect(el().querySelector('.poll-toggle')?.getAttribute('aria-checked')).toBe('true');
            expect(el().querySelectorAll('.slot-item')).toHaveLength(1);
            expect(submit().textContent).toContain('Lancer le sondage');
            expect(submit().disabled).toBe(true);
            expect(el().textContent).toContain('Proposez au moins 2 créneaux.');

            el().querySelector<HTMLButtonElement>('.add-slot')!.click();
            render();

            expect(el().querySelectorAll('.slot-item')).toHaveLength(2);
            expect(el().querySelectorAll('.slot-item')[1].classList).toContain('selected');
            expect(submit().disabled).toBe(false);
        });

        it('template_shouldRemoveASlot_fromItsCross', () => {
            component.togglePollMode();
            component.addSlot();
            render();

            el().querySelectorAll<HTMLButtonElement>('.slot-remove')[0].click();
            render();

            expect(el().querySelectorAll('.slot-item')).toHaveLength(1);
            expect(el().querySelector<HTMLButtonElement>('.slot-remove')!.disabled).toBe(true);
        });

        it('template_shouldReadCreer_outsidePollMode', () => {
            render();

            expect(el().querySelector('.submit-btn')?.textContent).toContain('Créer');
            expect(el().querySelector('.poll-slots')).toBeNull();
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
