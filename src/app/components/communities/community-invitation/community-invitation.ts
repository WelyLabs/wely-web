import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { finalize, map, switchMap } from 'rxjs';

import { CommunityInvitation, communityErrorMessage } from '../../../models/community.model';
import { CommunityService } from '../../../services/community.service';

/** Where an invitation link lands: who invites to what, and a button to join, or why one cannot. */
@Component({
  selector: 'app-community-invitation',
  standalone: true,
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './community-invitation.html',
  styleUrl: './community-invitation.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityInvitationComponent {
  private readonly communities = inject(CommunityService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly invitation = signal<CommunityInvitation | null>(null);
  readonly loading = signal(true);
  readonly accepting = signal(false);
  /** Why the invitation cannot be used, worded for the reader. */
  readonly problem = signal<string | null>(null);

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => params.get('token') ?? ''),
        switchMap((token) => this.communities.invitation(token).pipe(finalize(() => this.loading.set(false)))),
      )
      .subscribe({
        next: (invitation) => this.invitation.set(invitation),
        error: (err: HttpErrorResponse) => this.problem.set(this.messageFor(err)),
      });
  }

  accept(): void {
    const invitation = this.invitation();
    if (!invitation || invitation.expired) {
      return;
    }
    this.accepting.set(true);
    this.communities
      .accept(invitation.token)
      .pipe(finalize(() => this.accepting.set(false)))
      .subscribe({
        next: (community) => void this.router.navigate(['/communities', community.communityId]),
        error: (err: HttpErrorResponse) => {
          if (err.error?.code === 'SCL-BUS-014') {
            this.invitation.set({ ...invitation, expired: true });
          } else {
            this.problem.set(this.messageFor(err));
          }
        },
      });
  }

  private messageFor(err: HttpErrorResponse): string {
    return communityErrorMessage(err.error?.code) ?? "Cette invitation n'a pas pu être chargée.";
  }
}
