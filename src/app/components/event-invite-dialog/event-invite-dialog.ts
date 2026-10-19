import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { last, switchMap } from 'rxjs';

import { EventService, FeedEvent } from '../../services/event.service';
import { SocialService } from '../../services/social.service';
import { ChatService } from '../../services/chat.service';
import { UserNodeDTO } from '../../models/user.model';
import { eventInvitationLink, invitationError } from '../../models/event-invitation';
import { avatarColor, initialsOf } from '../../core/ui/avatar';

export interface EventInviteDialogData {
  event: FeedEvent;
  /** Who takes part already, left out of the list. */
  participantIds: string[];
  /** Who is invited already, shown as such and offered to take back. */
  invitedIds: string[];
}

/** sending, then invited: the invitation is stored and its message sent; withdrawing: taking it back. */
type InviteState = 'sending' | 'invited' | 'failed' | 'withdrawing';

const DAY_FORMAT = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const TIME_FORMAT = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * Invites friends to an event, one at a time: wely-events lets the friend see it, private or not,
 * then a message with its link goes to the friend's conversation, where the chat shows it as an
 * invitation card. An invitation can be taken back. Closes with who is invited now.
 */
@Component({
  selector: 'app-event-invite-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './event-invite-dialog.html',
  styleUrl: './event-invite-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventInviteDialogComponent {
  private readonly events = inject(EventService);
  private readonly social = inject(SocialService);
  private readonly chat = inject(ChatService);
  private readonly dialogRef = inject<MatDialogRef<EventInviteDialogComponent, string[]>>(MatDialogRef);
  readonly data = inject<EventInviteDialogData>(MAT_DIALOG_DATA);

  readonly friends = signal<UserNodeDTO[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly states = signal<Record<string, InviteState>>(
    Object.fromEntries(this.data.invitedIds.map((id) => [id, 'invited' as InviteState])));
  readonly errors = signal<Record<string, string>>({});

  readonly shown = computed(() => {
    const query = this.query().trim().toLowerCase();
    const taken = new Set([this.data.event.organizerId, ...this.data.participantIds]);
    return this.friends()
      .filter((friend) => !taken.has(friend.userId))
      .filter((friend) => !query || friend.userName.toLowerCase().includes(query));
  });
  readonly invitedIds = computed(() =>
    Object.entries(this.states()).filter(([, state]) => state === 'invited' || state === 'withdrawing').map(([id]) => id));
  readonly isPrivate = this.data.event.visibility === 'PRIVATE';

  constructor() {
    this.social.listFriends().subscribe({
      next: (friends) => {
        this.friends.set([...friends].sort((a, b) => a.userName.localeCompare(b.userName)));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  invite(friend: UserNodeDTO): void {
    const event = this.data.event;
    this.setState(friend.userId, 'sending');
    this.clearError(friend.userId);
    this.events
      .inviteFriend(event.id, friend.userId)
      .pipe(
        switchMap(() =>
          this.chat.getConversation(friend.userId).pipe(
            switchMap((conversation) => this.chat.sendMessage(conversation.id, this.messageFor(event), friend.userId)),
            last(),
          )),
      )
      .subscribe({
        next: (message) => {
          // Stored either way: the friend sees the event, only the message failed.
          this.setState(friend.userId, 'invited');
          if (message.failed) {
            this.setError(friend.userId, "Invitation enregistrée, mais le message n'est pas parti.");
          }
        },
        error: (error: unknown) => {
          this.setState(friend.userId, 'failed');
          this.setError(friend.userId, invitationError(error));
        },
      });
  }

  withdraw(friend: UserNodeDTO): void {
    this.setState(friend.userId, 'withdrawing');
    this.clearError(friend.userId);
    this.events.withdrawInvitation(this.data.event.id, friend.userId).subscribe({
      next: () => this.states.update((states) => without(states, friend.userId)),
      error: (error: unknown) => {
        this.setState(friend.userId, 'invited');
        this.setError(friend.userId, invitationError(error));
      },
    });
  }

  stateOf(userId: string): InviteState | undefined {
    return this.states()[userId];
  }

  color(userId: string): string {
    return avatarColor(userId);
  }

  initials(name: string): string {
    return initialsOf(name);
  }

  close(): void {
    this.dialogRef.close(this.invitedIds());
  }

  private messageFor(event: FeedEvent): string {
    return `Je t'invite à « ${event.title} »${whenOf(event)} sur Wely : ${eventInvitationLink(event.id)}`;
  }

  private setState(userId: string, state: InviteState): void {
    this.states.update((states) => ({ ...states, [userId]: state }));
  }

  private setError(userId: string, message: string): void {
    this.errors.update((errors) => ({ ...errors, [userId]: message }));
  }

  private clearError(userId: string): void {
    this.errors.update((errors) => without(errors, userId));
  }
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => id !== key));
}

/** « le samedi 25 octobre à 20:00 », or nothing while the date is voted on. */
export function whenOf(event: FeedEvent): string {
  if (event.poll?.status === 'OPEN') {
    return '';
  }
  if (event.allDay) {
    const day = new Date(event.startDate.getUTCFullYear(), event.startDate.getUTCMonth(), event.startDate.getUTCDate());
    return ` le ${DAY_FORMAT.format(day)}`;
  }
  return ` le ${DAY_FORMAT.format(event.startDate)} à ${TIME_FORMAT.format(event.startDate)}`;
}
