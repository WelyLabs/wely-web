import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventConflictsComponent } from './event-conflicts';
import { ScheduleService } from '../../services/schedule.service';
import { NotificationService } from '../../services/notification.service';
import { FeedEvent, FreeRange } from '../../services/event.service';

const at = (iso: string) => new Date(iso);

const event = (overrides: Partial<FeedEvent> = {}): FeedEvent => ({
  id: 'doctor', title: 'Médecin', organizerId: 'me', startDate: at('2026-10-16T14:00:00'),
  endDate: at('2026-10-16T15:00:00'), location: 'Cabinet', image: null, description: '', ...overrides
});

const bowling = event({ id: 'bowling', title: 'Bowling', organizerId: 'me', endDate: at('2026-10-16T16:00:00') });
const anHourLater: FreeRange = { start: at('2026-10-16T15:00:00'), end: at('2026-10-16T17:00:00') };

describe('EventConflictsComponent', () => {
  let fixture: ComponentFixture<EventConflictsComponent>;
  let component: EventConflictsComponent;
  let schedule: { getConflicts: ReturnType<typeof vi.fn>; getProposals: ReturnType<typeof vi.fn>; reschedule: ReturnType<typeof vi.fn> };
  let notifications: { showInfo: ReturnType<typeof vi.fn> };

  const el = (): HTMLElement => fixture.nativeElement;

  function create(shown: FeedEvent = event(), meId: string | null = 'me'): void {
    fixture = TestBed.createComponent(EventConflictsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('event', shown);
    fixture.componentRef.setInput('meId', meId);
    fixture.detectChanges();
  }

  beforeEach(() => {
    schedule = {
      getConflicts: vi.fn().mockReturnValue(of([bowling])),
      getProposals: vi.fn().mockReturnValue(of([anHourLater])),
      reschedule: vi.fn().mockReturnValue(of({ ...bowling, startDate: anHourLater.start, endDate: anHourLater.end }))
    };
    notifications = { showInfo: vi.fn() };
    TestBed.configureTestingModule({
      imports: [EventConflictsComponent],
      providers: [
        { provide: ScheduleService, useValue: schedule },
        { provide: NotificationService, useValue: notifications }
      ]
    });
  });

  it('should show nothing when the event clashes with nothing', () => {
    schedule.getConflicts.mockReturnValue(of([]));
    create();

    expect(el().querySelector('.conflict-card')).toBeNull();
  });

  it('should show nothing when the conflicts could not be read', () => {
    schedule.getConflicts.mockReturnValue(throwError(() => new Error('down')));
    create();

    expect(el().querySelector('.conflict-card')).toBeNull();
  });

  it('should alert about each conflicting event, saying which ones the viewer organizes', () => {
    create();

    expect(schedule.getConflicts).toHaveBeenCalledWith('doctor');
    expect(el().querySelector('.conflict-head')?.textContent).toContain('Conflit d\'agenda');
    expect(el().querySelector('.conflict-list')?.textContent).toContain('Bowling');
    expect(el().querySelector('.tag')?.textContent).toContain('Tu organises');
  });

  it('should count several conflicts', () => {
    schedule.getConflicts.mockReturnValue(of([bowling, event({ id: 'run', title: 'Course', organizerId: 'lea' })]));
    create();

    expect(el().querySelector('.conflict-head')?.textContent).toContain('2 de tes événements');
  });

  it('should offer to move this event and the conflicting ones the viewer organizes', () => {
    schedule.getConflicts.mockReturnValue(of([bowling, event({ id: 'run', title: 'Course', organizerId: 'lea' })]));
    create();

    expect(component.movable().map(target => target.id)).toEqual(['doctor', 'bowling']);
    const toggles = Array.from(el().querySelectorAll('.move-toggle')).map(button => button.textContent);
    expect(toggles[0]).toContain('Replanifier cette sortie');
    expect(toggles[1]).toContain('Replanifier « Bowling »');
  });

  it('should only alert a participant, offering to move what they organize themselves', () => {
    schedule.getConflicts.mockReturnValue(of([event({ id: 'run', title: 'Course', organizerId: 'lea' })]));
    create(event({ organizerId: 'hugo' }));

    expect(component.movable()).toEqual([]);
    expect(el().querySelector('.move-toggle')).toBeNull();
    expect(el().querySelector('.hint')?.textContent).toContain('Seul l\'organisateur');
  });

  it('should offer nothing to move until the viewer is known', () => {
    create(event(), null);

    expect(component.movable()).toEqual([]);
  });

  it('should list the proposals of the event opened, then close them on a second click', () => {
    create();

    component.toggle(bowling);
    fixture.detectChanges();

    expect(schedule.getProposals).toHaveBeenCalledWith('bowling');
    expect(el().querySelector('.proposal')?.textContent).toContain('1 h plus tard');

    component.toggle(bowling);
    fixture.detectChanges();
    expect(el().querySelector('.proposal')).toBeNull();
  });

  it('should say so while the proposals are on their way, and when there is none', () => {
    const answer = new Subject<FreeRange[]>();
    schedule.getProposals.mockReturnValue(answer);
    create();

    component.toggle(bowling);
    fixture.detectChanges();
    expect(el().textContent).toContain('Recherche des créneaux libres');

    answer.next([]);
    fixture.detectChanges();
    expect(el().textContent).toContain('Aucun créneau où tout le monde est libre');
  });

  it('should ignore proposals arriving for an event closed meanwhile', () => {
    const answer = new Subject<FreeRange[]>();
    schedule.getProposals.mockReturnValueOnce(answer).mockReturnValue(of([]));
    create();

    component.toggle(bowling);
    component.toggle(event());
    answer.next([anHourLater]);

    expect(component.openId()).toBe('doctor');
    expect(component.proposals()).toEqual([]);
  });

  it('should say so when the proposals could not be read', () => {
    schedule.getProposals.mockReturnValue(throwError(() => new Error('down')));
    create();

    component.toggle(bowling);
    fixture.detectChanges();

    expect(el().querySelector('.error')?.textContent).toContain('n\'ont pas pu être proposés');
  });

  it('should move a conflicting event, tell the viewer, and check the conflicts again', () => {
    create();

    component.choose(bowling, anHourLater);
    fixture.detectChanges();

    expect(schedule.reschedule).toHaveBeenCalledWith('bowling', anHourLater.start, anHourLater.end);
    expect(notifications.showInfo).toHaveBeenCalledWith(expect.stringContaining('« Bowling » décalé'));
    expect(schedule.getConflicts).toHaveBeenCalledTimes(2);
    expect(component.moving()).toBeNull();
  });

  it('should hand this event back to the page once moved', () => {
    const moved = event({ startDate: at('2026-10-16T16:00:00'), endDate: at('2026-10-16T17:00:00') });
    schedule.reschedule.mockReturnValue(of(moved));
    create();
    const emitted: FeedEvent[] = [];
    component.rescheduled.subscribe(value => emitted.push(value));

    component.choose(event(), { start: moved.startDate, end: moved.endDate });

    expect(emitted).toEqual([moved]);
  });

  it('should not send a second move while one is on its way', () => {
    schedule.reschedule.mockReturnValue(new Subject());
    create();

    component.choose(bowling, anHourLater);
    component.choose(bowling, anHourLater);

    expect(schedule.reschedule).toHaveBeenCalledTimes(1);
  });

  it('should explain a refused move by its code', () => {
    schedule.reschedule.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'EVT-BUS-019' } })));
    create();

    component.choose(bowling, anHourLater);

    expect(component.error()).toContain('La date a changé entre-temps');
    expect(component.moving()).toBeNull();
  });

  it('should fall back on a generic message for any other failure', () => {
    schedule.reschedule.mockReturnValue(throwError(() => new Error('network')));
    create();

    component.choose(bowling, anHourLater);

    expect(component.error()).toContain('n\'a pas pu être décalée');
  });

  it('should word a proposal on another day with its day', () => {
    create();

    const label = component.proposalLabel(bowling, { start: at('2026-10-17T14:00:00'), end: at('2026-10-17T16:00:00') });

    expect(label).toContain('·');
    expect(label).not.toContain('plus tard');
  });

  it('should word when a conflicting event takes place, beside this one\'s day', () => {
    create();

    expect(component.whenOf(bowling)).toBe(`${at('2026-10-16T14:00:00').toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} – ${at('2026-10-16T16:00:00').toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`);
  });
});
