import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { last, switchMap } from 'rxjs';

import { Community, communityErrorMessage, invitationLink } from '../../../models/community.model';
import { UserNodeDTO } from '../../../models/user.model';
import { CommunityService } from '../../../services/community.service';
import { SocialService } from '../../../services/social.service';
import { ChatService } from '../../../services/chat.service';
import { avatarColor, initialsOf } from '../../../core/ui/avatar';

export interface CommunityInviteDialogData {
  community: Community;
  /** Who is a member already, left out of the list. */
  memberIds: string[];
}

type SendState = 'sending' | 'sent' | 'failed';

/**
 * Invites friends to a community: each invitation is created by wely-social, then its link is sent
 * to the friend as a message in their conversation, where the chat shows it as an invitation card.
 * Closes with how many were sent.
 */
@Component({
  selector: 'app-community-invite-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './community-invite-dialog.html',
  styleUrl: './community-invite-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityInviteDialogComponent {
  private readonly communities = inject(CommunityService);
  private readonly social = inject(SocialService);
  private readonly chat = inject(ChatService);
  private readonly dialogRef = inject<MatDialogRef<CommunityInviteDialogComponent, number>>(MatDialogRef);
  readonly data = inject<CommunityInviteDialogData>(MAT_DIALOG_DATA);

  readonly friends = signal<UserNodeDTO[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly states = signal<Record<string, SendState>>({});
  readonly errors = signal<Record<string, string>>({});

  readonly shown = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.friends()
      .filter((friend) => !this.data.memberIds.includes(friend.userId))
      .filter((friend) => !query || friend.userName.toLowerCase().includes(query));
  });
  readonly sentCount = computed(() => Object.values(this.states()).filter((state) => state === 'sent').length);

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
    const community = this.data.community;
    this.setState(friend.userId, 'sending');
    this.communities
      .invite(community.communityId, friend.userId)
      .pipe(
        switchMap((invitation) =>
          this.chat.getConversation(friend.userId).pipe(
            switchMap((conversation) =>
              this.chat.sendMessage(conversation.id, this.messageFor(invitation.token), friend.userId)),
            last(),
          )),
      )
      .subscribe({
        next: (message) => this.setState(friend.userId, message.failed ? 'failed' : 'sent'),
        error: (err: HttpErrorResponse) => {
          this.setState(friend.userId, 'failed');
          this.errors.update((errors) => ({
            ...errors,
            [friend.userId]: communityErrorMessage(err?.error?.code) ?? "L'invitation n'a pas pu être envoyée.",
          }));
        },
      });
  }

  stateOf(userId: string): SendState | undefined {
    return this.states()[userId];
  }

  color(userId: string): string {
    return avatarColor(userId);
  }

  initials(name: string): string {
    return initialsOf(name);
  }

  close(): void {
    this.dialogRef.close(this.sentCount());
  }

  private messageFor(token: string): string {
    const community = this.data.community;
    return `Je t'invite à rejoindre la communauté « ${community.name} » sur Wely (valable 3 jours) : ${invitationLink(token)}`;
  }

  private setState(userId: string, state: SendState): void {
    this.states.update((states) => ({ ...states, [userId]: state }));
  }
}
