import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { avatarColor, initialsOf } from '../../../core/ui/avatar';
import { DELETED_USER_AVATAR_COLOR, DELETED_USER_ICON, DELETED_USER_LABEL } from '../../../core/ui/deleted-user';
import { AvatarService } from '../../../services/avatar.service';
import { DeletedUsersService } from '../../../services/deleted-users.service';
import { invitationPath, invitationTokenIn } from '../../../models/community.model';
import { eventInvitationIn, eventInvitationPath } from '../../../models/event-invitation';

/** What a bubble shows: one message, from the viewer or from someone else. */
export interface ChatBubbleMessage {
  text: string;
  time: Date | string;
  isMe: boolean;
  /** Names the avatar and the author line of someone else's message; null once the sender deleted their account. */
  senderName?: string | null;
  /** Keeps the avatar's colour stable per person; the name stands in when it is missing. */
  senderId?: string;
  /** Sent, not yet acknowledged by the server. */
  pending?: boolean;
  /** The server refused it, or the connection failed. */
  failed?: boolean;
  /** A photo the message carries: a signed or local URL, its size, or that it was removed. */
  photo?: { url: string | null; width: number; height: number; removed: boolean } | null;
  /** A notice from Wely: a centred line, no author, no avatar. */
  system?: boolean;
}

/**
 * One message, styled the same wherever a conversation shows: the chat screen and the event page's
 * preview of its group.
 */
@Component({
  selector: 'app-chat-bubble',
  standalone: true,
  imports: [DatePipe, MatIconModule, RouterLink],
  templateUrl: './chat-bubble.html',
  styleUrl: './chat-bubble.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatBubbleComponent {
  private readonly avatars = inject(AvatarService);
  private readonly deletedUsers = inject(DeletedUsersService);

  readonly message = input.required<ChatBubbleMessage>();
  /** A tap on the photo; the page decides what opens. */
  readonly photoOpened = output<void>();

  readonly deletedIcon = DELETED_USER_ICON;

  /** Someone else's message wely-chat anonymized, from an account wely-users confirms deleted. */
  readonly deletedSender = computed(() => {
    const message = this.message();
    return !message.isMe && !message.system && !message.senderName && !!message.senderId
      && this.deletedUsers.isDeleted(message.senderId)();
  });
  readonly author = computed(() => this.message().senderName || (this.deletedSender() ? DELETED_USER_LABEL : ''));
  readonly initials = computed(() => this.deletedSender() ? '' : initialsOf(this.author()));
  readonly color = computed(() =>
    this.deletedSender() ? DELETED_USER_AVATAR_COLOR : avatarColor(this.message().senderId ?? this.author()));
  /**
   * A community or event invitation the message links to: shown as a card with a button rather than
   * a bare link, with the words that came before the link.
   */
  readonly invitation = computed(() => {
    const text = this.message().text;
    const token = invitationTokenIn(text);
    if (token) {
      return { kind: 'community' as const, link: invitationPath(token), intro: introOf(text, /https?:\/\/|\/communities\/invite\//) };
    }
    const eventId = eventInvitationIn(text);
    if (eventId) {
      return { kind: 'event' as const, link: eventInvitationPath(eventId), intro: introOf(text, /https?:\/\/|\/event\//) };
    }
    return null;
  });
  /** The author's photo; the coloured initials stand in until it arrives, or when there is none. */
  readonly picture = computed(() =>
    this.message().isMe || this.message().system || this.deletedSender() ? null : this.avatars.url(this.message().senderId)());
}

/** The words before the link, without the colon that introduced it. */
function introOf(text: string, link: RegExp): string {
  return text.slice(0, text.search(link)).replace(/\s*:\s*$/, '').trim();
}
