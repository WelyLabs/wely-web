import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { catchError, distinctUntilChanged, of, switchMap } from 'rxjs';
import { FeedEvent, FreeRange } from '../../services/event.service';
import { ScheduleService } from '../../services/schedule.service';
import { NotificationService } from '../../services/notification.service';
import { LoggerService } from '../../core/logging/logger.service';
import { PendingTrailDirective } from '../../core/ui/pending-trail.directive';
import { rangeLabel, shiftLabel } from '../../core/ui/schedule-labels';
import { EVENT_IN_PAST_CODE, EVENT_IN_PAST_MESSAGE } from '../../core/ui/past-date';

/** What a refused move means for the organizer, by the server's error code. */
const MOVE_ERRORS: Readonly<Record<string, string>> = {
  'EVT-BUS-017': 'Ce créneau n\'est plus possible : choisis-en un autre.',
  'EVT-BUS-018': 'Le sondage de date est encore ouvert : fixe la date dans le sondage.',
  'EVT-BUS-019': 'La date a changé entre-temps : recharge la page avant de la déplacer.',
  [EVENT_IN_PAST_CODE]: EVENT_IN_PAST_MESSAGE
};
const MOVE_FAILED = 'La sortie n\'a pas pu être décalée. Réessaie dans un instant.';

/**
 * « Conflit d'agenda »: the viewer's events that this one overlaps, and new times for those of
 * them, this one included, that the viewer organizes. Someone who only takes part is told about
 * the conflict, and only offered to move what they organize themselves.
 */
@Component({
  selector: 'app-event-conflicts',
  standalone: true,
  imports: [MatIconModule, PendingTrailDirective],
  templateUrl: './event-conflicts.html',
  styleUrl: './event-conflicts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventConflictsComponent {
  private readonly schedule = inject(ScheduleService);
  private readonly notifications = inject(NotificationService);
  private readonly logger = inject(LoggerService);

  readonly event = input.required<FeedEvent>();
  readonly meId = input<string | null>(null);
  /** This event, moved by its organizer: the page shows it from now on. */
  readonly rescheduled = output<FeedEvent>();

  readonly conflicts = signal<FeedEvent[]>([]);
  /** The event whose proposals are open, and those proposals once read; null while asking. */
  readonly openId = signal<string | null>(null);
  readonly proposals = signal<FreeRange[] | null>(null);
  /** The proposal being applied, by its start. */
  readonly moving = signal<number | null>(null);
  readonly error = signal('');

  /** Bumped after another event was moved: its conflict may be gone. */
  private readonly reload = signal(0);

  /** What the viewer may move: this event if they organize it, then the conflicting ones they organize. */
  readonly movable = computed(() => {
    const me = this.meId();
    const event = this.event();
    if (!me) {
      return [];
    }
    const own = this.conflicts().filter(other => other.organizerId === me);
    return event.organizerId === me ? [event, ...own] : own;
  });

  constructor() {
    // Asked again when the event's dates change, or another event was moved; an error shows nothing.
    const key = computed(() => {
      const event = this.event();
      return `${event.id}|${event.startDate.getTime()}|${event.endDate.getTime()}|${this.reload()}`;
    });
    toObservable(key).pipe(
      distinctUntilChanged(),
      switchMap(() => this.schedule.getConflicts(this.event().id).pipe(catchError(error => {
        this.logger.error('EventConflictsComponent', 'Could not check conflicts:', error);
        return of([]);
      }))),
      takeUntilDestroyed()
    ).subscribe(conflicts => {
      this.conflicts.set(conflicts);
      this.close();
    });
  }

  isMine(event: FeedEvent): boolean {
    return event.organizerId === this.meId();
  }

  isCurrent(event: FeedEvent): boolean {
    return event.id === this.event().id;
  }

  /** Opens the proposals for one event, closing any other; a second click closes them. */
  toggle(target: FeedEvent): void {
    if (this.openId() === target.id) {
      this.close();
      return;
    }
    this.openId.set(target.id);
    this.proposals.set(null);
    this.error.set('');
    this.schedule.getProposals(target.id).subscribe({
      next: proposals => {
        if (this.openId() === target.id) {
          this.proposals.set(proposals);
        }
      },
      error: (error: unknown) => {
        this.logger.error('EventConflictsComponent', 'Could not read proposals:', error);
        if (this.openId() === target.id) {
          this.proposals.set([]);
          this.error.set('Les créneaux n\'ont pas pu être proposés. Réessaie dans un instant.');
        }
      }
    });
  }

  choose(target: FeedEvent, proposal: FreeRange): void {
    if (this.moving() !== null) {
      return;
    }
    this.moving.set(proposal.start.getTime());
    this.error.set('');
    this.schedule.reschedule(target.id, proposal.start, proposal.end).subscribe({
      next: moved => {
        this.moving.set(null);
        // Referenced to no particular day, the label always names the new one.
        this.notifications.showInfo(`« ${moved.title} » décalé : ${rangeLabel(moved.startDate, moved.endDate, new Date(0))}`);
        if (this.isCurrent(target)) {
          this.rescheduled.emit(moved);
        } else {
          this.reload.update(count => count + 1);
        }
      },
      error: (error: unknown) => {
        this.moving.set(null);
        const code = error instanceof HttpErrorResponse ? error.error?.code : undefined;
        this.error.set((code && MOVE_ERRORS[code]) || MOVE_FAILED);
        this.logger.error('EventConflictsComponent', 'Could not move the event:', error);
      }
    });
  }

  /** When a conflicting event takes place, beside this one's day. */
  whenOf(other: FeedEvent): string {
    return rangeLabel(other.startDate, other.endDate, this.event().startDate);
  }

  /** « 15:00 – 17:00 · 1 h plus tard » on the same day, the day and hours on another. */
  proposalLabel(target: FeedEvent, proposal: FreeRange): string {
    const when = rangeLabel(proposal.start, proposal.end, target.startDate);
    return when.includes('·') ? when : `${when} · ${shiftLabel(target.startDate, proposal.start)}`;
  }

  private close(): void {
    this.openId.set(null);
    this.proposals.set(null);
  }
}
