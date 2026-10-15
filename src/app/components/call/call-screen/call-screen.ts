import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { CallService } from '../../../services/call.service';
import { AvatarService } from '../../../services/avatar.service';
import { ChatService } from '../../../services/chat.service';
import { NavigationService } from '../../../services/navigation.service';
import { UserService } from '../../../services/user.service';
import { MediaStreamDirective } from '../../../core/ui/media-stream.directive';
import { avatarColor, initialsOf } from '../../../core/ui/avatar';

/**
 * The call, full screen: a tile per person (their camera, or their photo), the user's own camera
 * in a corner, and the controls. Leaving the page keeps the call; hanging up ends it.
 */
@Component({
  selector: 'app-call-screen',
  imports: [MatIconModule, MediaStreamDirective],
  templateUrl: './call-screen.html',
  styleUrl: './call-screen.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CallScreenComponent {
  readonly calls = inject(CallService);
  private readonly avatars = inject(AvatarService);
  private readonly chat = inject(ChatService);
  private readonly navigation = inject(NavigationService);
  private readonly me = inject(UserService).getCurrentUserValue()?.id;

  private readonly callId = inject(ActivatedRoute).snapshot.paramMap.get('callId');
  /** A group's name, read once; a direct call is named after the other person. */
  private readonly groupTitle = signal<string | null>(null);
  private readonly now = signal(Date.now());

  readonly onPhone = toSignal(inject(BreakpointObserver).observe('(max-width: 768px)').pipe(map(state => state.matches)),
    { initialValue: false });

  readonly title = computed(() => {
    const call = this.calls.call();
    if (!call) {
      return '';
    }
    if (call.memberIds.length === 2) {
      return this.nameOf(call.memberIds.find(id => id !== this.me));
    }
    return this.groupTitle() ?? 'Appel de groupe';
  });

  /** "Ça sonne…" until someone answers, then the time spent in the call. */
  readonly status = computed(() => {
    const call = this.calls.call();
    if (!call || this.calls.connection() === 'connecting') {
      return 'Connexion…';
    }
    if (this.calls.connection() === 'failed') {
      return 'Connexion perdue';
    }
    if (this.calls.participants().length === 0) {
      return call.status === 'RINGING' ? 'Ça sonne…' : 'En attente des autres…';
    }
    const seconds = Math.max(0, Math.floor((this.now() - Date.parse(call.startedAt)) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });

  constructor() {
    if (this.callId && this.calls.call()?.id !== this.callId) {
      // Opened from a link or after a reload: join, or go back if that fails.
      void this.calls.join(this.callId).then(call => {
        if (!call) {
          this.navigation.back();
        }
      });
    }
    const tick = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));

    // Once the call is over, back to where the user came from.
    let joined = false;
    effect(() => {
      const call = this.calls.call();
      if (call) {
        joined = true;
      } else if (joined) {
        this.navigation.back();
      }
    });
    effect(() => {
      const call = this.calls.call();
      if (call && call.memberIds.length > 2 && this.groupTitle() === null) {
        this.chat.getConversationById(call.conversationId).subscribe({
          next: conversation => this.groupTitle.set(conversation.title ?? 'Appel de groupe'),
          error: () => this.groupTitle.set('Appel de groupe'),
        });
      }
    });
  }

  nameOf(userId: string | undefined): string {
    return userId ? this.calls.nameOf(userId)() ?? '…' : '';
  }

  pictureOf(userId: string): string | null {
    return this.avatars.url(userId)();
  }

  initials(userId: string): string {
    return initialsOf(this.nameOf(userId) || '?');
  }

  color(userId: string): string {
    return avatarColor(userId);
  }

  /** Back to the app while the call goes on; the bar at the top brings the user back. */
  minimize(): void {
    this.navigation.back();
  }

  hangUp(): void {
    void this.calls.leave();
  }
}
