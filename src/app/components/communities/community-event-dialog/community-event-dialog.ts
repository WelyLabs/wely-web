import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { finalize } from 'rxjs';

import { Community, communityErrorMessage } from '../../../models/community.model';
import { EventService, FeedEvent } from '../../../services/event.service';
import { EVENT_IN_PAST_MESSAGE, isEventInPast, startsInPast } from '../../../core/ui/past-date';

/** `YYYY-MM-DD` of a local date, as an `<input type="date">` takes it. */
function localDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Publishes an event in a community, visible to its members only. Closes with the event as stored.
 * The visibility is not asked: in a community it is always the community's.
 */
@Component({
  selector: 'app-community-event-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule],
  templateUrl: './community-event-dialog.html',
  styleUrl: './community-event-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityEventDialogComponent {
  private readonly events = inject(EventService);
  private readonly dialogRef = inject<MatDialogRef<CommunityEventDialogComponent, FeedEvent>>(MatDialogRef);
  readonly community = inject<Community>(MAT_DIALOG_DATA);

  readonly title = signal('');
  readonly day = signal(localDate(new Date(Date.now() + 7 * 24 * 3600 * 1000)));
  readonly startTime = signal('19:00');
  readonly endTime = signal('22:00');
  readonly location = signal('');
  readonly description = signal('');
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  private readonly start = computed(() => new Date(`${this.day()}T${this.startTime()}`));
  private readonly end = computed(() => {
    const end = new Date(`${this.day()}T${this.endTime()}`);
    // Ending earlier than it starts: it ends the next day, as an evening out often does.
    return end <= this.start() ? new Date(end.getTime() + 24 * 3600 * 1000) : end;
  });

  /** A start already behind: said under the dates rather than left as a greyed-out button. */
  readonly pastDate = computed(() => !Number.isNaN(this.start().getTime()) && startsInPast(this.start()));
  readonly pastDateMessage = EVENT_IN_PAST_MESSAGE;

  readonly valid = computed(() =>
    this.title().trim().length > 0 && this.location().trim().length > 0
    && !Number.isNaN(this.start().getTime()) && !this.pastDate());

  save(): void {
    if (!this.valid() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.events
      .createEvent({
        title: this.title().trim(),
        startDate: this.start(),
        endDate: this.end(),
        location: this.location().trim(),
        description: this.description().trim() || undefined,
        communityId: this.community.communityId,
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (event) => this.dialogRef.close(event),
        error: (err: HttpErrorResponse) =>
          this.error.set(isEventInPast(err) ? EVENT_IN_PAST_MESSAGE
            : communityErrorMessage(err.error?.code) ?? "L'événement n'a pas pu être publié."),
      });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
