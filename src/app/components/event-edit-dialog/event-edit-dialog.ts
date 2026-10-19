import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Observable, finalize, of, switchMap } from 'rxjs';

import { EventService, FeedEvent, Visibility } from '../../services/event.service';
import { ScheduleService } from '../../services/schedule.service';
import { Coordinates, Place } from '../../models/place.model';
import { eventEditError } from '../../models/event-invitation';
import { LocationPickerComponent } from '../location-picker/location-picker';
import { VISIBILITY_OPTIONS, toDateValue, toTimeValue } from '../quick-event-popover/quick-event-popover';
import { allDayLocalRange, allDayWireRange } from '../../core/ui/all-day';
import { EVENT_IN_PAST_MESSAGE, startsInPast } from '../../core/ui/past-date';

const DAY_MS = 86_400_000;

/** A local date and time from the fields' values; an invalid date when either is missing. */
function at(day: string, time: string): Date {
  return new Date(`${day}T${time || '00:00'}`);
}

/**
 * The organizer rewrites the event: what, where, who sees it and, once the date is fixed, when.
 * The details go through `PUT /events/{id}`, a new time through `/schedule`, which tells the group.
 * Closes with the event as stored, or nothing when cancelled.
 */
@Component({
  selector: 'app-event-edit-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatIconModule, LocationPickerComponent],
  templateUrl: './event-edit-dialog.html',
  styleUrl: './event-edit-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventEditDialogComponent {
  private readonly events = inject(EventService);
  private readonly schedule = inject(ScheduleService);
  private readonly dialogRef = inject<MatDialogRef<EventEditDialogComponent, FeedEvent>>(MatDialogRef);
  readonly event = inject<FeedEvent>(MAT_DIALOG_DATA);

  readonly visibilityOptions = VISIBILITY_OPTIONS;
  readonly pastDateMessage = EVENT_IN_PAST_MESSAGE;
  readonly allDay = !!this.event.allDay;
  /** The date is still voted on: it is fixed from the poll, not here. */
  readonly polling = this.event.poll?.status === 'OPEN';
  readonly surprise = this.event.kind === 'SURPRISE';
  /** Who sees it is chosen, but for a community's event, or a surprise kept for the honoree's friends. */
  readonly choosesVisibility = !this.event.communityId && !this.surprise;

  private readonly localRange = this.allDay
    ? allDayLocalRange(this.event.startDate, this.event.endDate)
    : { start: this.event.startDate, end: this.event.endDate };

  readonly title = signal(this.event.title);
  readonly location = signal(this.event.location ?? '');
  readonly coordinates = signal<Coordinates | null>(this.event.coordinates ?? null);
  readonly description = signal(this.event.description ?? '');
  readonly visibility = signal<Visibility>(this.event.visibility ?? 'FRIENDS');
  readonly startDay = signal(toDateValue(this.localRange.start));
  readonly startTime = signal(toTimeValue(this.localRange.start));
  /** An all-day event's last day, included; otherwise the end's day. */
  readonly endDay = signal(toDateValue(this.allDay
    ? new Date(this.localRange.end.getTime() - DAY_MS)
    : this.localRange.end));
  readonly endTime = signal(toTimeValue(this.localRange.end));
  readonly pickingLocation = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly visibilityHint = computed(() =>
    VISIBILITY_OPTIONS.find(option => option.value === this.visibility())?.hint ?? '');
  readonly pickedPlace = computed<Place | null>(() => {
    const point = this.coordinates();
    return point ? { label: this.location(), coordinates: point } : null;
  });

  /** What the dates send: whole UTC days for an all-day event. */
  readonly range = computed(() => {
    if (this.allDay) {
      const { startDate, endDate } = allDayWireRange(at(this.startDay(), ''), at(this.endDay(), ''));
      return { start: startDate, end: endDate };
    }
    return { start: at(this.startDay(), this.startTime()), end: at(this.endDay(), this.endTime()) };
  });
  readonly datesChanged = computed(() => !this.polling && (
    this.range().start.getTime() !== this.event.startDate.getTime()
    || this.range().end.getTime() !== this.event.endDate.getTime()));
  readonly datesValid = computed(() => {
    const { start, end } = this.range();
    return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start;
  });
  /** A moved start already behind: said under the dates rather than left as a greyed-out button. */
  readonly pastDate = computed(() => this.datesChanged() && this.datesValid() && !this.allDay
    && startsInPast(this.range().start));

  readonly valid = computed(() =>
    this.title().trim().length > 0
    && (this.surprise || this.location().trim().length > 0)
    && (this.polling || (this.datesValid() && !this.pastDate())));

  /** A typed place no longer matches the pin: the pin goes. */
  onLocationTyped(value: string): void {
    this.location.set(value);
    this.coordinates.set(null);
  }

  onPlacePicked(place: Place): void {
    this.location.set(place.label);
    this.coordinates.set(place.coordinates);
    this.pickingLocation.set(false);
  }

  toggleLocationPicker(): void {
    this.pickingLocation.update(open => !open);
  }

  save(): void {
    if (!this.valid() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const range = this.range();
    const moved = this.datesChanged();
    this.events.updateEvent(this.event.id, {
      title: this.title().trim(),
      location: this.location().trim(),
      coordinates: this.coordinates(),
      description: this.description().trim() || null,
      ...(this.choosesVisibility ? { visibility: this.visibility() } : {}),
    }).pipe(
      switchMap((updated): Observable<FeedEvent> => moved
        ? this.schedule.reschedule(this.event.id, range.start, range.end)
        : of(updated)),
      finalize(() => this.saving.set(false)),
    ).subscribe({
      next: (updated) => this.dialogRef.close(updated),
      error: (error: unknown) => this.error.set(eventEditError(error)),
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
