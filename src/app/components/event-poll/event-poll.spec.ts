import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventService, FeedEvent, Poll } from '../../services/event.service';
import { LoggerService } from '../../core/logging/logger.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog';
import { EventPollComponent, Voter, leadingSlotId, withBallot } from './event-poll';

const poll = (overrides: Partial<Poll> = {}): Poll => ({
    status: 'OPEN',
    fixedSlotId: null,
    slots: [
        { id: 's1', start: new Date(2026, 9, 20, 19), end: new Date(2026, 9, 20, 22), yes: ['a'], maybe: ['me'], no: [] },
        { id: 's2', start: new Date(2026, 9, 21, 19), end: new Date(2026, 9, 21, 22), yes: ['a', 'b'], maybe: [], no: ['me'] }
    ],
    ...overrides
});

const event = (overrides: Partial<FeedEvent> = {}): FeedEvent => ({
    id: 'e1', title: 'Dîner', organizerId: 'org', startDate: new Date(2026, 9, 20, 19), endDate: new Date(2026, 9, 20, 22),
    location: 'Chez Léa', image: null, description: '', poll: poll(), ...overrides
});

describe('poll helpers', () => {
    it('withBallot_shouldReplaceTheVotersWholeBallot', () => {
        const updated = withBallot(poll(), 'me', { s2: 'YES' });

        expect(updated.slots[0].maybe).toEqual([]);
        expect(updated.slots[1].yes).toEqual(['a', 'b', 'me']);
        expect(updated.slots[1].no).toEqual([]);
    });

    it('leadingSlotId_shouldPreferMostYes_thenMostMaybe', () => {
        expect(leadingSlotId(poll())).toBe('s2');
        const tied = poll({
            slots: [
                { ...poll().slots[0], yes: ['a'], maybe: [] },
                { ...poll().slots[1], yes: ['b'], maybe: ['c'] }
            ]
        });
        expect(leadingSlotId(tied)).toBe('s2');
    });

    it('leadingSlotId_shouldBeNull_whenNobodyLeansAnywhere', () => {
        const empty = poll({ slots: poll().slots.map(slot => ({ ...slot, yes: [], maybe: [], no: ['x'] })) });

        expect(leadingSlotId(empty)).toBeNull();
    });
});

describe('EventPollComponent', () => {
    let fixture: ComponentFixture<EventPollComponent>;
    let component: EventPollComponent;
    let eventService: { vote: ReturnType<typeof vi.fn>; fixDate: ReturnType<typeof vi.fn> };
    let dialog: { open: ReturnType<typeof vi.fn> };
    const voterOf = (id: string): Voter => ({ id, name: `Name ${id}`, initials: id.toUpperCase() });
    const el = (): HTMLElement => fixture.nativeElement;
    const rows = () => Array.from(el().querySelectorAll<HTMLElement>('.poll-row'));
    const chip = (row: number, answer: string) =>
        rows()[row].querySelector<HTMLButtonElement>(`.answer-chip[data-answer="${answer}"]`)!;

    function create(inputs: { event?: FeedEvent; meId?: string | null; isOrganizer?: boolean } = {}): void {
        fixture = TestBed.createComponent(EventPollComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('event', inputs.event ?? event());
        fixture.componentRef.setInput('meId', inputs.meId === undefined ? 'me' : inputs.meId);
        fixture.componentRef.setInput('isOrganizer', inputs.isOrganizer ?? false);
        fixture.componentRef.setInput('voterOf', voterOf);
        fixture.detectChanges();
    }

    // The slots are set on 20 and 21 October 2026: today is pinned before them.
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 9, 1, 8));
    });

    afterEach(() => vi.useRealTimers());

    beforeEach(() => {
        eventService = { vote: vi.fn(), fixDate: vi.fn() };
        dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }) };
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            imports: [EventPollComponent],
            providers: [
                { provide: EventService, useValue: eventService },
                { provide: MatDialog, useValue: dialog },
                { provide: LoggerService, useValue: { error: vi.fn() } }
            ]
        });
    });

    it('template_shouldShowOneRowPerSlot_withCountsAndVoters', () => {
        create();

        expect(rows()).toHaveLength(2);
        expect(rows()[1].textContent).toContain('2 oui · 0 peut-être · 1 non');
        expect(rows()[0].querySelectorAll('.voter')).toHaveLength(2);
        expect(rows()[0].querySelector('.voter.maybe')?.getAttribute('title')).toBe('Name me (peut-être)');
    });

    it('template_shouldShowANeutralAvatar_forADeletedVoter', () => {
        create();
        fixture.componentRef.setInput('voterOf', (id: string): Voter => id === 'me'
            ? { id, name: 'Utilisateur supprimé', initials: '', deleted: true }
            : voterOf(id));
        fixture.detectChanges();

        const deleted = Array.from(el().querySelectorAll<HTMLElement>('.voter'))
            .find(voter => voter.getAttribute('title')?.startsWith('Utilisateur supprimé'))!;
        expect(deleted.querySelector('mat-icon')?.textContent).toBe('person');
        expect(deleted.style.background).toBe('rgb(138, 138, 147)');
    });

    it('template_shouldHighlightTheLeadingSlot', () => {
        create();

        expect(rows()[1].classList).toContain('leading');
        expect(rows()[0].classList).not.toContain('leading');
        expect(rows()[1].textContent).toContain('En tête');
    });

    it('template_shouldCheckMyAnswer_inARadiogroup', () => {
        create();

        expect(rows()[0].querySelector('.answer-chips')?.getAttribute('role')).toBe('radiogroup');
        expect(chip(0, 'MAYBE').getAttribute('aria-checked')).toBe('true');
        expect(chip(0, 'YES').getAttribute('aria-checked')).toBe('false');
        expect(chip(1, 'NO').classList).toContain('active');
    });

    it('template_shouldCountTheVotersItCannotShow', () => {
        const crowded = poll({ slots: [{ ...poll().slots[0], yes: ['a', 'b', 'c', 'd', 'e', 'f'], maybe: [] }] });
        create({ event: event({ poll: crowded }) });

        expect(rows()[0].querySelectorAll('.voter:not(.more)')).toHaveLength(4);
        expect(rows()[0].querySelector('.voter.more')?.textContent).toContain('+2');
    });

    it('myAnswers_shouldBeEmpty_withoutAViewer', () => {
        create({ meId: null });

        expect(component.myAnswers()).toEqual({});
        expect(chip(0, 'YES').disabled).toBe(true);
    });

    it('vote_shouldSendTheWholeBallot_andShowItAtOnce', () => {
        const answer = new Subject<Poll>();
        eventService.vote.mockReturnValue(answer);
        create();

        chip(0, 'YES').click();
        fixture.detectChanges();

        expect(eventService.vote).toHaveBeenCalledWith('e1', { s1: 'YES', s2: 'NO' });
        expect(component.poll()?.slots[0].yes).toEqual(['a', 'me']);
        expect(chip(0, 'YES').getAttribute('aria-checked')).toBe('true');
    });

    it('vote_shouldKeepTheServersPoll_andEmitIt', () => {
        const confirmed = withBallot(poll(), 'me', { s1: 'YES', s2: 'NO' });
        eventService.vote.mockReturnValue(of(confirmed));
        create();
        const emitted: Poll[] = [];
        component.pollChange.subscribe(value => emitted.push(value));

        component.vote('s1', 'YES');

        expect(component.poll()).toEqual(confirmed);
        expect(emitted).toEqual([confirmed]);
    });

    it('vote_shouldRollBack_andExplain_whenTheVoteFails', () => {
        eventService.vote.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 502 })));
        create();

        component.vote('s1', 'YES');
        fixture.detectChanges();

        expect(component.poll()).toEqual(poll());
        expect(el().querySelector('.poll-error')?.textContent).toContain('pas été enregistré');
        expect(chip(0, 'MAYBE').getAttribute('aria-checked')).toBe('true');
    });

    it('vote_shouldSayThePollIsClosed_onAConflict', () => {
        eventService.vote.mockReturnValue(throwError(() =>
            new HttpErrorResponse({ status: 409, error: { code: 'EVT-BUS-015' } })));
        create();

        component.vote('s1', 'YES');

        expect(component.error()).toContain('clos');
    });

    it('vote_shouldDoNothing_whenTheAnswerIsUnchanged_orThePollClosed', () => {
        create();
        component.vote('s1', 'MAYBE');
        expect(eventService.vote).not.toHaveBeenCalled();

        fixture.componentRef.setInput('event', event({ poll: poll({ status: 'CLOSED' }) }));
        component.vote('s1', 'YES');
        expect(eventService.vote).not.toHaveBeenCalled();
    });

    it('poll_shouldFollowTheEventInput_whenALiveUpdateArrives', () => {
        create();

        fixture.componentRef.setInput('event', event({ poll: withBallot(poll(), 'b', { s1: 'YES' }) }));

        expect(component.poll()?.slots[0].yes).toEqual(['a', 'b']);
    });

    it('template_shouldOfferToFixADate_onlyToTheOrganizer', () => {
        create();
        expect(el().querySelector('.fix-button')).toBeNull();

        create({ isOrganizer: true });
        expect(el().querySelectorAll('.fix-button')).toHaveLength(2);
    });

    it('fix_shouldConfirm_thenFixTheSlot_andEmitTheEvent', () => {
        const fixedEvent = event({ poll: poll({ status: 'CLOSED', fixedSlotId: 's2' }) });
        eventService.fixDate.mockReturnValue(of(fixedEvent));
        create({ isOrganizer: true });
        const emitted: FeedEvent[] = [];
        component.fixed.subscribe(value => emitted.push(value));

        el().querySelectorAll<HTMLButtonElement>('.fix-button')[1].click();

        expect(dialog.open).toHaveBeenCalledWith(ConfirmDialogComponent, expect.objectContaining({
            data: expect.objectContaining({ title: 'Fixer cette date ?' })
        }));
        expect(eventService.fixDate).toHaveBeenCalledWith('e1', 's2');
        expect(emitted).toEqual([fixedEvent]);
        expect(component.fixing()).toBeNull();
    });

    it('fix_shouldDoNothing_whenTheOrganizerCancels', () => {
        dialog.open.mockReturnValue({ afterClosed: () => of(false) });
        create({ isOrganizer: true });

        component.fix(poll().slots[0]);

        expect(eventService.fixDate).not.toHaveBeenCalled();
    });

    it('fix_shouldExplainAFailure', () => {
        eventService.fixDate.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
        create({ isOrganizer: true });

        component.fix(poll().slots[0]);

        expect(component.error()).toContain('pas pu être fixée');
        expect(component.fixing()).toBeNull();
    });

    it('fix_shouldNotOfferASlotAlreadyPast', () => {
        vi.setSystemTime(new Date(2026, 9, 20, 21));
        create({ isOrganizer: true });

        component.fix(poll().slots[0]);

        expect(dialog.open).not.toHaveBeenCalled();
        const buttons = el().querySelectorAll<HTMLButtonElement>('.fix-button');
        expect(buttons[0].disabled).toBe(true);
        expect(buttons[0].textContent).toContain('Créneau passé');
        expect(buttons[1].textContent).toContain('Fixer cette date');
    });

    it('fix_shouldSayTheDateIsPast_whenTheServerRefusesIt', () => {
        eventService.fixDate.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { code: 'EVT-BUS-038' } })));
        create({ isOrganizer: true });

        component.fix(poll().slots[0]);

        expect(component.error()).toContain('déjà passée');
    });

    it('fix_shouldBeRefused_toSomeoneElse', () => {
        create();

        component.fix(poll().slots[0]);

        expect(dialog.open).not.toHaveBeenCalled();
    });
});
