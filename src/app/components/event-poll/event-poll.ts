import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { filter, switchMap } from 'rxjs';
import { EventService, FeedEvent, Poll, PollAnswer, PollSlot } from '../../services/event.service';
import { LoggerService } from '../../core/logging/logger.service';
import { avatarColor } from '../../core/ui/avatar';
import { DELETED_USER_AVATAR_COLOR, DELETED_USER_ICON } from '../../core/ui/deleted-user';
import { PendingTrailDirective } from '../../core/ui/pending-trail.directive';
import { EVENT_IN_PAST_MESSAGE, isEventInPast, startsInPast } from '../../core/ui/past-date';
import { ConfirmDialogComponent, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';

/** Someone who voted, as the avatars show them. */
export interface Voter {
  id: string;
  name: string;
  initials: string;
  picture?: string;
  /** A closed poll keeps the ballots of a deleted account, shown neutral. */
  deleted?: boolean;
}

/** The answers offered on each slot, in the order shown. */
export const ANSWER_CHOICES: readonly { value: PollAnswer; label: string }[] = [
  { value: 'YES', label: 'Oui' },
  { value: 'MAYBE', label: 'Peut-être' },
  { value: 'NO', label: 'Non' }
];

/** How many voters' avatars a slot shows before counting the rest. */
const SHOWN_VOTERS = 4;
const POLL_CLOSED_CODE = 'EVT-BUS-015';

/** The poll with one voter's whole ballot replaced, as the server will do it. */
export function withBallot(poll: Poll, voterId: string, answers: Record<string, PollAnswer>): Poll {
  const without = (ids: string[]) => ids.filter(id => id !== voterId);
  return {
    ...poll,
    slots: poll.slots.map(slot => {
      const answer = answers[slot.id];
      return {
        ...slot,
        yes: answer === 'YES' ? [...without(slot.yes), voterId] : without(slot.yes),
        maybe: answer === 'MAYBE' ? [...without(slot.maybe), voterId] : without(slot.maybe),
        no: answer === 'NO' ? [...without(slot.no), voterId] : without(slot.no)
      };
    })
  };
}

/** The slot most voted yes, then maybe; null while nobody leans anywhere. */
export function leadingSlotId(poll: Poll): string | null {
  let best: PollSlot | null = null;
  for (const slot of poll.slots) {
    const better = !best || slot.yes.length > best.yes.length
      || (slot.yes.length === best.yes.length && slot.maybe.length > best.maybe.length);
    if (better) {
      best = slot;
    }
  }
  return best && best.yes.length + best.maybe.length > 0 ? best.id : null;
}

/** « Quand ? »: the proposed slots, the viewer's vote on each, and the organizer's choice. */
@Component({
  selector: 'app-event-poll',
  standalone: true,
  imports: [MatIconModule, PendingTrailDirective],
  templateUrl: './event-poll.html',
  styleUrl: './event-poll.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventPollComponent {
  private readonly eventService = inject(EventService);
  private readonly dialog = inject(MatDialog);
  private readonly logger = inject(LoggerService);
  private readonly destroyRef = inject(DestroyRef);

  readonly event = input.required<FeedEvent>();
  readonly meId = input<string | null>(null);
  readonly isOrganizer = input(false);
  /** Name and picture of a voter, from the page's directory. */
  readonly voterOf = input.required<(id: string) => Voter>();

  /** A new state of the poll, after the viewer's vote. */
  readonly pollChange = output<Poll>();
  /** The organizer fixed the date: the event as it now stands. */
  readonly fixed = output<FeedEvent>();

  readonly choices = ANSWER_CHOICES;
  readonly deletedAvatarColor = DELETED_USER_AVATAR_COLOR;
  readonly deletedIcon = DELETED_USER_ICON;
  /** The poll shown: the event's, or the viewer's vote before the server confirmed it. */
  readonly poll = linkedSignal(() => this.event().poll ?? null);
  readonly error = signal<string | null>(null);
  /** The slot being fixed, while the request runs. */
  readonly fixing = signal<string | null>(null);

  /** The viewer's current answers, by slot. */
  readonly myAnswers = computed<Record<string, PollAnswer>>(() => {
    const me = this.meId();
    const answers: Record<string, PollAnswer> = {};
    for (const slot of this.poll()?.slots ?? []) {
      if (!me) {
        break;
      }
      const answer: PollAnswer | null = slot.yes.includes(me) ? 'YES' : slot.maybe.includes(me) ? 'MAYBE'
        : slot.no.includes(me) ? 'NO' : null;
      if (answer) {
        answers[slot.id] = answer;
      }
    }
    return answers;
  });

  readonly rows = computed(() => {
    const poll = this.poll();
    if (!poll) {
      return [];
    }
    const leading = leadingSlotId(poll);
    const mine = this.myAnswers();
    const voterOf = this.voterOf();
    return poll.slots.map(slot => {
      const voters = [...slot.yes, ...slot.maybe];
      return {
        slot,
        leading: slot.id === leading,
        mine: mine[slot.id] ?? null,
        voters: voters.slice(0, SHOWN_VOTERS).map(id => ({ ...voterOf(id), maybe: !slot.yes.includes(id) })),
        hiddenVoters: Math.max(0, voters.length - SHOWN_VOTERS)
      };
    });
  });

  /** Sends the viewer's whole ballot with this answer changed, shown at once and undone on failure. */
  vote(slotId: string, answer: PollAnswer): void {
    const before = this.poll();
    const me = this.meId();
    if (!before || !me || before.status !== 'OPEN' || this.myAnswers()[slotId] === answer) {
      return;
    }
    const answers = { ...this.myAnswers(), [slotId]: answer };
    this.poll.set(withBallot(before, me, answers));
    this.error.set(null);
    this.eventService.vote(this.event().id, answers).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: poll => {
        this.poll.set(poll);
        this.pollChange.emit(poll);
      },
      error: (error: unknown) => {
        this.poll.set(before);
        this.error.set(this.closed(error) ? 'Le sondage est clos : la date a été fixée.'
          : 'Ton vote n’a pas été enregistré. Réessaie dans un instant.');
        this.logger.error('EventPollComponent', 'Could not vote', error);
      }
    });
  }

  /** The organizer fixes the event on this slot, once confirmed. */
  fix(slot: PollSlot): void {
    if (!this.isOrganizer() || this.fixing() || this.isPast(slot)) {
      return;
    }
    const data: ConfirmDialogData = {
      title: 'Fixer cette date ?',
      message: `${this.dayLabel(slot.start)}, ${this.hours(slot)}. Ceux qui ont voté Oui seront inscrits et le sondage sera clos.`,
      confirmText: 'Fixer la date',
      cancelText: 'Annuler'
    };
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '400px',
      maxWidth: '95vw',
      data,
      panelClass: 'confirm-dialog-panel'
    }).afterClosed().pipe(
      filter(Boolean),
      switchMap(() => {
        this.fixing.set(slot.id);
        this.error.set(null);
        return this.eventService.fixDate(this.event().id, slot.id);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: event => {
        this.fixing.set(null);
        this.fixed.emit(event);
      },
      error: (error: unknown) => {
        this.fixing.set(null);
        this.error.set(this.closed(error) ? 'Le sondage est déjà clos.'
          : isEventInPast(error) ? EVENT_IN_PAST_MESSAGE
          : 'La date n’a pas pu être fixée. Réessaie dans un instant.');
        this.logger.error('EventPollComponent', 'Could not fix the date', error);
      }
    });
  }

  /** A slot gone by while the poll stayed open: the date can no longer be fixed on it. */
  isPast(slot: PollSlot): boolean {
    return startsInPast(slot.start);
  }

  avatarColor(id: string): string {
    return avatarColor(id);
  }

  dayLabel(date: Date): string {
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  hours(slot: PollSlot): string {
    const format = (date: Date) => date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${format(slot.start)} – ${format(slot.end)}`;
  }

  private closed(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 409 && error.error?.code === POLL_CLOSED_CODE;
  }
}
