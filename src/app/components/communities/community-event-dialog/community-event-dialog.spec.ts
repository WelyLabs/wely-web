import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityEventDialogComponent } from './community-event-dialog';
import { EventService } from '../../../services/event.service';
import { Community } from '../../../models/community.model';

const community = { communityId: 'c1', name: 'Club' } as Community;

describe('CommunityEventDialogComponent', () => {
  let events: { createEvent: ReturnType<typeof vi.fn> };
  let dialogRef: { close: ReturnType<typeof vi.fn> };
  let dialog: CommunityEventDialogComponent;

  beforeEach(() => {
    events = { createEvent: vi.fn().mockReturnValue(of({ id: 'e1' })) };
    dialogRef = { close: vi.fn() };
    TestBed.configureTestingModule({
      imports: [CommunityEventDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: EventService, useValue: events },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: community },
      ],
    });
    const fixture = TestBed.createComponent(CommunityEventDialogComponent);
    fixture.detectChanges();
    dialog = fixture.componentInstance;
  });

  function fill(): void {
    dialog.title.set('  Balade  ');
    dialog.location.set(' Annecy ');
    dialog.day.set('2099-05-01');
    dialog.startTime.set('09:00');
    dialog.endTime.set('18:00');
  }

  it('says which community the event goes to', () => {
    expect(TestBed.inject(MAT_DIALOG_DATA)).toBe(community);
    expect(dialog.community.name).toBe('Club');
  });

  it('publishes the event in the community and closes with it', () => {
    fill();
    dialog.description.set(' Pique-nique ');

    dialog.save();

    expect(events.createEvent).toHaveBeenCalledWith({
      title: 'Balade', location: 'Annecy', description: 'Pique-nique', communityId: 'c1',
      startDate: new Date('2099-05-01T09:00'), endDate: new Date('2099-05-01T18:00'),
    });
    expect(dialogRef.close).toHaveBeenCalledWith({ id: 'e1' });
  });

  it('ends the next day when the end is before the start', () => {
    fill();
    dialog.startTime.set('22:00');
    dialog.endTime.set('02:00');

    dialog.save();

    expect(events.createEvent.mock.calls[0][0].endDate).toEqual(new Date('2099-05-02T02:00'));
    expect(events.createEvent.mock.calls[0][0].description).toBeUndefined();
  });

  it('needs a title, a place and a date to come', () => {
    expect(dialog.valid()).toBe(false);
    fill();
    expect(dialog.valid()).toBe(true);
    dialog.day.set('2000-01-01');
    expect(dialog.valid()).toBe(false);

    dialog.save();
    expect(events.createEvent).not.toHaveBeenCalled();
  });

  it('words a refusal', () => {
    events.createEvent.mockReturnValue(throwError(() => ({ error: { code: 'EVT-BUS-024' } })));
    fill();

    dialog.save();

    expect(dialog.error()).toContain('membres');
    expect(dialog.saving()).toBe(false);
  });

  it('falls back to a generic message', () => {
    events.createEvent.mockReturnValue(throwError(() => ({})));
    fill();

    dialog.save();

    expect(dialog.error()).toContain("n'a pas pu");
  });

  it('closes with nothing when cancelled', () => {
    dialog.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });
});
