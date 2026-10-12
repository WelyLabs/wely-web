import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';

import { avatarColor, initialsOf } from '../../../core/ui/avatar';

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
}

/**
 * One message, styled the same wherever a conversation shows: the chat screen and the event page's
 * preview of its group.
 */
@Component({
  selector: 'app-chat-bubble',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './chat-bubble.html',
  styleUrl: './chat-bubble.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatBubbleComponent {
  readonly message = input.required<ChatBubbleMessage>();

  readonly author = computed(() => this.message().senderName ?? '');
  readonly initials = computed(() => initialsOf(this.author()));
  readonly color = computed(() => avatarColor(this.message().senderId ?? this.author()));
}
