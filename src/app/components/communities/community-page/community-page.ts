import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, LowerCasePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { EMPTY, Observable, catchError, filter, map, switchMap, tap } from 'rxjs';

import {
  Community,
  CommunityInvitation,
  CommunityMember,
  CommunityRole,
  communityErrorMessage,
} from '../../../models/community.model';
import { CommunityService } from '../../../services/community.service';
import { EventService, FeedEvent, PollAnswer } from '../../../services/event.service';
import { UserService } from '../../../services/user.service';
import { NotificationService } from '../../../services/notification.service';
import { avatarColor, initialsOf } from '../../../core/ui/avatar';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../confirm-dialog/confirm-dialog';
import { CommunityFormDialogComponent } from '../community-form-dialog/community-form-dialog';
import { CommunityEventDialogComponent } from '../community-event-dialog/community-event-dialog';
import { CommunityInviteDialogComponent } from '../community-invite-dialog/community-invite-dialog';

type Tab = 'events' | 'members' | 'invitations';

/** The answers a member can give, in the order the buttons show them. */
const ANSWERS: { value: PollAnswer; label: string; icon: string }[] = [
  { value: 'YES', label: 'Oui', icon: 'check_circle' },
  { value: 'MAYBE', label: 'Peut-être', icon: 'help' },
  { value: 'NO', label: 'Non', icon: 'cancel' },
];

/**
 * One community: what it is about for everyone who may see it; its events, members and, for its
 * admins, its invitations, for its members only.
 */
@Component({
  selector: 'app-community-page',
  standalone: true,
  imports: [DatePipe, LowerCasePipe, RouterLink, MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './community-page.html',
  styleUrl: './community-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityPageComponent {
  private readonly communities = inject(CommunityService);
  private readonly events = inject(EventService);
  private readonly users = inject(UserService);
  private readonly notifications = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly currentUser = toSignal(this.users.currentUser$, { initialValue: this.users.getCurrentUserValue() });

  readonly answers = ANSWERS;
  readonly community = signal<Community | null>(null);
  readonly members = signal<CommunityMember[]>([]);
  readonly communityEvents = signal<FeedEvent[]>([]);
  readonly invitations = signal<CommunityInvitation[]>([]);
  readonly tab = signal<Tab>('events');
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly busy = signal(false);
  /** The event whose full list of answers is unfolded. */
  readonly expanded = signal<string | null>(null);

  readonly me = computed(() => this.currentUser()?.id ?? null);
  readonly isMember = computed(() => !!this.community()?.role);
  readonly isAdmin = computed(() => this.community()?.role === 'ADMIN');
  readonly initials = computed(() => initialsOf(this.community()?.name ?? ''));
  readonly color = computed(() => avatarColor(this.community()?.communityId ?? ''));
  private readonly names = computed(() => new Map(this.members().map((member) => [member.userId, member.userName])));

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => params.get('id') ?? ''),
        tap(() => this.reset()),
        switchMap((id) => this.communities.get(id).pipe(catchError((err: HttpErrorResponse) => this.onLoadError(err)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((community) => {
        this.community.set(community);
        this.loading.set(false);
        if (community.role) {
          this.loadMemberContent();
        }
      });
  }

  select(tab: Tab): void {
    this.tab.set(tab);
    if (tab === 'invitations') {
      this.loadInvitations();
    }
  }

  nameOf(userId: string): string {
    if (userId === this.me()) {
      return 'Vous';
    }
    return this.names().get(userId) ?? 'Ancien membre';
  }

  myAnswer(event: FeedEvent): PollAnswer | null {
    const me = this.me();
    const responses = event.responses;
    if (!me || !responses) {
      return null;
    }
    if (responses.yes.includes(me)) {
      return 'YES';
    }
    return responses.maybe.includes(me) ? 'MAYBE' : responses.no.includes(me) ? 'NO' : null;
  }

  countOf(event: FeedEvent, answer: PollAnswer): number {
    return this.idsOf(event, answer).length;
  }

  idsOf(event: FeedEvent, answer: PollAnswer): string[] {
    const responses = event.responses;
    if (!responses) {
      return [];
    }
    return answer === 'YES' ? responses.yes : answer === 'MAYBE' ? responses.maybe : responses.no;
  }

  canDelete(event: FeedEvent): boolean {
    return this.isAdmin() || event.organizerId === this.me();
  }

  respond(event: FeedEvent, answer: PollAnswer): void {
    if (this.myAnswer(event) === answer) {
      return;
    }
    if (event.organizerId === this.me() && answer !== 'YES') {
      this.notifications.showInfo("Vous organisez cet événement : passez la main depuis sa page pour ne plus y participer.");
      return;
    }
    this.events.respond(event.id, answer).subscribe({
      next: (updated) => this.replaceEvent(updated),
      error: () => this.notifications.showInfo("Votre réponse n'a pas pu être enregistrée."),
    });
  }

  toggleResponses(event: FeedEvent): void {
    this.expanded.set(this.expanded() === event.id ? null : event.id);
  }

  join(): void {
    const community = this.community();
    if (!community) {
      return;
    }
    this.busy.set(true);
    this.communities.join(community.communityId).subscribe({
      next: (joined) => {
        this.busy.set(false);
        this.community.set(joined);
        this.loadMemberContent();
        this.notifications.showInfo(`Bienvenue dans « ${joined.name} » !`);
      },
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  leave(): void {
    const community = this.community();
    if (!community) {
      return;
    }
    this.confirm({
      title: 'Quitter la communauté ?',
      message: this.isAdmin()
        ? "Si vous êtes le dernier administrateur, le membre le plus ancien le deviendra à votre place."
        : 'Vous ne verrez plus ses événements. Vous pourrez la rejoindre à nouveau si elle est publique.',
      confirmText: 'Quitter',
      cancelText: 'Annuler',
      isDestructive: true,
    })
      .pipe(switchMap(() => this.communities.leave(community.communityId)))
      .subscribe({
        next: () => this.afterLeaving(community),
        error: (err: HttpErrorResponse) => {
          if (err.error?.code === 'SCL-BUS-016') {
            this.confirmDeletionOnLeave(community);
          } else {
            this.fail(err);
          }
        },
      });
  }

  edit(): void {
    this.dialog
      .open(CommunityFormDialogComponent, { width: '520px', maxWidth: '95vw', data: this.community() })
      .afterClosed()
      .subscribe((updated?: Community) => updated && this.community.set(updated));
  }

  remove(): void {
    const community = this.community();
    if (!community) {
      return;
    }
    this.confirm({
      title: 'Supprimer la communauté ?',
      message: `« ${community.name} » et ses invitations seront supprimées pour tous ses membres. C'est définitif.`,
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      isDestructive: true,
    })
      .pipe(switchMap(() => this.communities.delete(community.communityId)))
      .subscribe({
        next: () => {
          this.notifications.showInfo('Communauté supprimée.');
          void this.router.navigate(['/communities']);
        },
        error: (err: HttpErrorResponse) => this.fail(err),
      });
  }

  invite(): void {
    const community = this.community();
    if (!community) {
      return;
    }
    this.dialog
      .open(CommunityInviteDialogComponent, {
        width: '480px',
        maxWidth: '95vw',
        data: { community, memberIds: this.members().map((member) => member.userId) },
      })
      .afterClosed()
      .subscribe((sent?: number) => {
        if (sent) {
          this.loadInvitations();
        }
      });
  }

  newEvent(): void {
    const community = this.community();
    if (!community) {
      return;
    }
    this.dialog
      .open(CommunityEventDialogComponent, { width: '520px', maxWidth: '95vw', data: community })
      .afterClosed()
      .subscribe((created?: FeedEvent) => {
        if (created) {
          this.communityEvents.update((list) =>
            [...list, created].sort((a, b) => a.startDate.getTime() - b.startDate.getTime()));
        }
      });
  }

  deleteEvent(event: FeedEvent): void {
    this.confirm({
      title: "Supprimer l'événement ?",
      message: `« ${event.title} » sera supprimé pour tous les membres.`,
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      isDestructive: true,
    })
      .pipe(switchMap(() => this.events.deleteEvent(event.id)))
      .subscribe({
        next: () => this.communityEvents.update((list) => list.filter((item) => item.id !== event.id)),
        error: () => this.notifications.showInfo("L'événement n'a pas pu être supprimé."),
      });
  }

  setRole(member: CommunityMember, role: CommunityRole): void {
    const community = this.community();
    if (!community) {
      return;
    }
    this.communities.changeRole(community.communityId, member.userId, role).subscribe({
      next: () => {
        this.loadMembers();
        if (member.userId === this.me()) {
          this.communities.get(community.communityId).subscribe((fresh) => this.community.set(fresh));
        }
      },
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  removeMember(member: CommunityMember): void {
    const community = this.community();
    if (!community) {
      return;
    }
    this.confirm({
      title: 'Retirer ce membre ?',
      message: `${member.userName} ne fera plus partie de « ${community.name} ».`,
      confirmText: 'Retirer',
      cancelText: 'Annuler',
      isDestructive: true,
    })
      .pipe(switchMap(() => this.communities.removeMember(community.communityId, member.userId)))
      .subscribe({
        next: () => {
          this.members.update((list) => list.filter((item) => item.userId !== member.userId));
          this.community.update((current) => current && { ...current, memberCount: current.memberCount - 1 });
        },
        error: (err: HttpErrorResponse) => this.fail(err),
      });
  }

  revoke(invitation: CommunityInvitation): void {
    const community = this.community();
    if (!community) {
      return;
    }
    this.communities.revoke(community.communityId, invitation.token).subscribe({
      next: () => this.invitations.update((list) => list.filter((item) => item.token !== invitation.token)),
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  memberColor(userId: string): string {
    return avatarColor(userId);
  }

  memberInitials(name: string): string {
    return initialsOf(name);
  }

  private reset(): void {
    this.loading.set(true);
    this.notFound.set(false);
    this.community.set(null);
    this.members.set([]);
    this.communityEvents.set([]);
    this.invitations.set([]);
    this.tab.set('events');
  }

  private onLoadError(err: HttpErrorResponse): Observable<never> {
    this.loading.set(false);
    this.notFound.set(true);
    if (err.status !== 404) {
      this.notifications.showInfo('Impossible de charger la communauté.');
    }
    return EMPTY;
  }

  private loadMemberContent(): void {
    this.loadMembers();
    const community = this.community();
    if (!community) {
      return;
    }
    this.events.getCommunityEvents(community.communityId).subscribe({
      next: (list) => this.communityEvents.set(list),
      error: () => this.communityEvents.set([]),
    });
  }

  private loadMembers(): void {
    const community = this.community();
    if (!community) {
      return;
    }
    this.communities.members(community.communityId).subscribe({
      next: (list) => this.members.set(list),
      error: () => this.members.set([]),
    });
  }

  private loadInvitations(): void {
    const community = this.community();
    if (!community || !this.isAdmin()) {
      return;
    }
    this.communities.invitations(community.communityId).subscribe({
      next: (list) => this.invitations.set(list),
      error: () => this.invitations.set([]),
    });
  }

  private replaceEvent(updated: FeedEvent): void {
    this.communityEvents.update((list) => list.map((event) => (event.id === updated.id ? updated : event)));
  }

  private confirmDeletionOnLeave(community: Community): void {
    this.confirm({
      title: 'Vous êtes le seul membre',
      message: `Quitter « ${community.name} » la supprimera définitivement.`,
      confirmText: 'Quitter et supprimer',
      cancelText: 'Annuler',
      isDestructive: true,
    })
      .pipe(switchMap(() => this.communities.leave(community.communityId, true)))
      .subscribe({
        next: () => this.afterLeaving(community),
        error: (err: HttpErrorResponse) => this.fail(err),
      });
  }

  private afterLeaving(community: Community): void {
    this.notifications.showInfo(`Vous avez quitté « ${community.name} ».`);
    if (community.visibility === 'PRIVATE') {
      void this.router.navigate(['/communities']);
      return;
    }
    this.communities.get(community.communityId).subscribe({
      next: (fresh) => {
        this.community.set(fresh);
        this.members.set([]);
        this.communityEvents.set([]);
      },
      error: () => void this.router.navigate(['/communities']),
    });
  }

  /** Emits once when confirmed; completes silently when cancelled. */
  private confirm(data: ConfirmDialogData): Observable<true> {
    return this.dialog
      .open(ConfirmDialogComponent, { width: '420px', maxWidth: '95vw', data })
      .afterClosed()
      .pipe(filter((confirmed): confirmed is true => confirmed === true));
  }

  private fail(err: HttpErrorResponse): void {
    this.busy.set(false);
    this.notifications.showInfo(communityErrorMessage(err.error?.code) ?? "L'opération a échoué, réessayez.");
  }
}
