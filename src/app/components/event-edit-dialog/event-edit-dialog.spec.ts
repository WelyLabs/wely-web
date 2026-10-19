import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EventEditDialogComponent } from './event-edit-dialog';
import { EventService, FeedEvent } from '../../services/event.service';
import { ScheduleService } from '../../services/schedule.service';

const at = (local: string) => new Date(local);

const dinner = (overrides: Partial<FeedEvent> = {}): FeedEvent => ({
  id: 'e1', title: 'Dîner', organizerId: 'me',
  startDate: at('2026-10-25T20:00:00'), endDate: at('2026-10-25T23:00:00'),
  location: 'Chez moi', coordinates: { latitude: 45.76, longitude: 4.83 }, image: null,
  description: 'Apportez un dessert', visibility: 'PRIVATE', ...overrides,
});

describe('EventEditDialogComponent', () => {
  let events: { updateEvent: ReturnType<typeof vi.fn> };
  let schedule: { reschedule: ReturnType<typeof vi.fn> };
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  // The map is a @defer block: its metadata resolves asynchronously.
  async function open(event: FeedEvent = dinner()) {
    TestBed.configureTestingModule({
      imports: [EventEditDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: EventService, useValue: events },
        { provide: ScheduleService, useValue: schedule },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: event },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(EventEditDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at('2026-10-19T10:00:00'));
    events = { updateEvent: vi.fn().mockReturnValue(of(dinner({ title: 'Grand dîner' }))) };
    schedule = { reschedule: vi.fn().mockReturnValue(of(dinner({ title: 'Grand dîner', startDate: at('2026-10-26T20:00:00') }))) };
    dialogRef = { close: vi.fn() };
  });

  afterEach(() => vi.useRealTimers());

  it('shouldStartFromTheEventAsItIs', async () => {
    const dialog = (await open()).componentInstance;

    expect(dialog.title()).toBe('Dîner');
    expect(dialog.startDay()).toBe('2026-10-25');
    expect(dialog.startTime()).toBe('20:00');
    expect(dialog.endDay()).toBe('2026-10-25');
    expect(dialog.endTime()).toBe('23:00');
    expect(dialog.visibility()).toBe('PRIVATE');
    expect(dialog.datesChanged()).toBe(false);
    expect(dialog.valid()).toBe(true);
  });

  it('save_shouldPutTheDetailsOnly_whenTheDatesDidNotMove', async () => {
    const dialog = (await open()).componentInstance;
    dialog.title.set('  Grand dîner ');
    dialog.description.set('   ');

    dialog.save();

    expect(events.updateEvent).toHaveBeenCalledWith('e1', {
      title: 'Grand dîner', location: 'Chez moi', coordinates: { latitude: 45.76, longitude: 4.83 },
      description: null, visibility: 'PRIVATE',
    });
    expect(schedule.reschedule).not.toHaveBeenCalled();
    expect(dialogRef.close).toHaveBeenCalledWith(dinner({ title: 'Grand dîner' }));
  });

  it('save_shouldMoveTheEvent_whenTheDatesChanged', async () => {
    const dialog = (await open()).componentInstance;
    dialog.startDay.set('2026-10-26');
    dialog.endDay.set('2026-10-26');

    expect(dialog.datesChanged()).toBe(true);
    dialog.save();

    expect(schedule.reschedule).toHaveBeenCalledWith('e1', at('2026-10-26T20:00:00'), at('2026-10-26T23:00:00'));
    expect(dialogRef.close).toHaveBeenCalledWith(expect.objectContaining({ startDate: at('2026-10-26T20:00:00') }));
  });

  it('valid_shouldRefuseAnEndBeforeTheStart_aMissingTitleOrPlace_orAPastStart', async () => {
    const dialog = (await open()).componentInstance;

    dialog.endTime.set('19:00');
    expect(dialog.datesValid()).toBe(false);
    expect(dialog.valid()).toBe(false);
    dialog.endTime.set('23:00');

    dialog.title.set('  ');
    expect(dialog.valid()).toBe(false);
    dialog.title.set('Dîner');

    dialog.location.set('');
    expect(dialog.valid()).toBe(false);
    dialog.location.set('Chez moi');

    dialog.startDay.set('2026-10-18');
    dialog.endDay.set('2026-10-18');
    expect(dialog.pastDate()).toBe(true);
    expect(dialog.valid()).toBe(false);

    dialog.save();
    expect(events.updateEvent).not.toHaveBeenCalled();
  });

  it('onLocationTyped_shouldDropThePin_andPickingAPlaceShouldSetBoth', async () => {
    const dialog = (await open()).componentInstance;

    dialog.onLocationTyped('Au parc');
    expect(dialog.coordinates()).toBeNull();
    expect(dialog.pickedPlace()).toBeNull();

    dialog.toggleLocationPicker();
    expect(dialog.pickingLocation()).toBe(true);
    dialog.onPlacePicked({ label: 'Parc de la Tête d’Or', coordinates: { latitude: 45.77, longitude: 4.85 } });
    expect(dialog.location()).toBe('Parc de la Tête d’Or');
    expect(dialog.pickedPlace()?.coordinates).toEqual({ latitude: 45.77, longitude: 4.85 });
    expect(dialog.pickingLocation()).toBe(false);
  });

  it('shouldEditAnAllDayEvent_byItsDays', async () => {
    const dialog = (await open(dinner({
      allDay: true,
      startDate: new Date(Date.UTC(2026, 9, 24)), endDate: new Date(Date.UTC(2026, 9, 26)),
    }))).componentInstance;

    expect(dialog.startDay()).toBe('2026-10-24');
    expect(dialog.endDay()).toBe('2026-10-25');
    expect(dialog.datesChanged()).toBe(false);

    dialog.endDay.set('2026-10-26');
    dialog.save();

    expect(schedule.reschedule).toHaveBeenCalledWith('e1', new Date(Date.UTC(2026, 9, 24)), new Date(Date.UTC(2026, 9, 27)));
  });

  it('shouldLeaveTheDateToThePoll_whileItIsOpen', async () => {
    const fixture = await open(dinner({ poll: { status: 'OPEN', fixedSlotId: null, slots: [] } }));
    const dialog = fixture.componentInstance;

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('La date se décide par le sondage');
    dialog.startDay.set('2026-10-01');
    expect(dialog.datesChanged()).toBe(false);
    expect(dialog.valid()).toBe(true);

    dialog.save();
    expect(schedule.reschedule).not.toHaveBeenCalled();
  });

  it('shouldNotAskWhoSeesACommunityEvent_norSendIt', async () => {
    const fixture = await open(dinner({ communityId: 'c1', visibility: 'COMMUNITY' }));

    expect((fixture.nativeElement as HTMLElement).querySelector('.visibility-choices')).toBeNull();
    fixture.componentInstance.save();

    expect(events.updateEvent.mock.calls[0][1]).not.toHaveProperty('visibility');
  });

  it('shouldAcceptASurpriseWithoutAPlace', async () => {
    const dialog = (await open(dinner({ kind: 'SURPRISE', location: '', visibility: 'FRIENDS' }))).componentInstance;

    expect(dialog.choosesVisibility).toBe(false);
    expect(dialog.valid()).toBe(true);
  });

  it('save_shouldExplainARefusal_andStayOpen', async () => {
    events.updateEvent.mockReturnValue(throwError(() =>
      new HttpErrorResponse({ status: 400, error: { code: 'EVT-BUS-033' } })));
    const dialog = (await open()).componentInstance;

    dialog.save();

    expect(dialog.error()).toBe('Le lieu est obligatoire.');
    expect(dialog.saving()).toBe(false);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('save_shouldSendOnlyOnce_whileSaving', async () => {
    const dialog = (await open()).componentInstance;
    dialog.saving.set(true);

    dialog.save();

    expect(events.updateEvent).not.toHaveBeenCalled();
  });

  it('cancel_shouldCloseWithoutResult', async () => {
    (await open()).componentInstance.cancel();

    expect(dialogRef.close).toHaveBeenCalledWith();
  });
});
