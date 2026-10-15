import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { CallService } from '../../../services/call.service';
import { AvatarService } from '../../../services/avatar.service';
import { Call } from '../../../models/call.model';
import { avatarColor, initialsOf } from '../../../core/ui/avatar';

/**
 * Over every page: the banner of a call ringing for the user, and while in a call away from its
 * screen, a bar to go back to it.
 */
@Component({
  selector: 'app-call-overlay',
  imports: [MatIconModule],
  templateUrl: './call-overlay.html',
  styleUrl: './call-overlay.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CallOverlayComponent {
  readonly calls = inject(CallService);
  private readonly avatars = inject(AvatarService);
  private readonly router = inject(Router);

  private readonly url = toSignal(this.router.events.pipe(
    filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    map(event => event.urlAfterRedirects)), { initialValue: this.router.url });

  /** The bar shows while in a call, except on the call's own screen. */
  readonly showReturnBar = computed(() => {
    const call = this.calls.call();
    return !!call && !this.url().startsWith(`/call/${call.id}`);
  });

  readonly callerName = computed(() => {
    const call = this.calls.incoming();
    return call ? this.calls.nameOf(call.startedBy)() ?? '…' : '';
  });

  readonly callerPicture = computed(() => {
    const call = this.calls.incoming();
    return call ? this.avatars.url(call.startedBy)() : null;
  });

  kindOf(call: Call): string {
    const kind = call.media === 'VIDEO' ? 'Appel vidéo' : 'Appel audio';
    return call.memberIds.length > 2 ? `${kind} de groupe` : kind;
  }

  readonly callerInitials = computed(() => initialsOf(this.callerName() || '?'));

  color(call: Call): string {
    return avatarColor(call.startedBy);
  }

  async accept(call: Call, withVideo: boolean): Promise<void> {
    const joined = await this.calls.join(call.id, withVideo ? 'VIDEO' : 'AUDIO');
    if (joined) {
      void this.router.navigate(['/call', joined.id]);
    }
  }

  decline(call: Call): void {
    this.calls.decline(call);
  }

  backToCall(): void {
    const call = this.calls.call();
    if (call) {
      void this.router.navigate(['/call', call.id]);
    }
  }

  hangUp(): void {
    void this.calls.leave();
  }
}
