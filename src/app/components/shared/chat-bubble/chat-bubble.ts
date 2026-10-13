import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

import { avatarColor, initialsOf } from '../../../core/ui/avatar';
import { AvatarService } from '../../../services/avatar.service';

/** What a bubble shows: one message, from the viewer or from someone else. */
export interface ChatBubbleMessage {
  text: string;
  time: Date | string;
  isMe: boolean;
  /** Names the avatar and the author line of someone else's message. */
  senderName?: string;
  /** Keeps the avatar's colour stable per person; the name stands in when it is missing. */
  senderId?: string;
  /** Sent, not yet acknowledged by the server. */
  pending?: boolean;
  /** The server refused it, or the connection failed. */
  failed?: boolean;
  /** A photo the message carries: a signed or local URL, its size, or that it was removed. */
  photo?: { url: string | null; width: number; height: number; removed: boolean } | null;
}

/**
 * One message, styled the same wherever a conversation shows: the chat screen and the event page's
 * preview of its group.
 */
@Component({
  selector: 'app-chat-bubble',
  standalone: true,
  imports: [DatePipe, MatIconModule],
  templateUrl: './chat-bubble.html',
  styleUrl: './chat-bubble.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatBubbleComponent {
  private readonly avatars = inject(AvatarService);

  readonly message = input.required<ChatBubbleMessage>();
  /** A tap on the photo; the page decides what opens. */
  readonly photoOpened = output<void>();

  readonly author = computed(() => this.message().senderName ?? '');
  readonly initials = computed(() => initialsOf(this.author()));
  readonly color = computed(() => avatarColor(this.message().senderId ?? this.author()));
  /** The author's photo; the coloured initials stand in until it arrives, or when there is none. */
  readonly picture = computed(() => this.message().isMe ? null : this.avatars.url(this.message().senderId)());
}
