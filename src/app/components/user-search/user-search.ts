import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Observable, map } from 'rxjs';
import { LoggerService } from '../../core/logging/logger.service';

import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FriendshipFilter, SocialService } from '../../services/social.service';
import { ChatService } from '../../services/chat.service';
import { UserWithStatusDTO } from '../../models/user.model';
import { Conversation } from '../../models/chat.model';
import { ClosenessAnswer, ClosenessChange, UserCardComponent } from '../user-card/user-card';
import { FriendSummary } from '../../models/friendship.model';
import { HttpErrorResponse } from '@angular/common/http';
import { AddFriendDialogComponent } from '../add-friend-dialog/add-friend-dialog';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog';

@Component({
    selector: 'app-user-search',
    standalone: true,
    imports: [
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatTabsModule,
    MatDialogModule,
    FormsModule,
    UserCardComponent
],
    templateUrl: './user-search.html',
    styleUrl: './user-search.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserSearchComponent implements OnInit {
    private readonly logger = inject(LoggerService);
    private readonly socialService = inject(SocialService);
    private readonly chatService = inject(ChatService);
    private readonly route = inject(ActivatedRoute);
    private readonly breakpointObserver = inject(BreakpointObserver);
    private readonly dialog = inject(MatDialog);
    private readonly router = inject(Router);
    private readonly destroyRef = inject(DestroyRef);

    /** Tabs, in order: friends, requests sent, requests received. */
    private static readonly TAB_FILTERS: readonly FriendshipFilter[] =
        ['FRIENDS', 'PENDING_OUTGOING', 'PENDING_INCOMING'];

    readonly tabLabels = ['Amis', 'Demandes envoyées', 'Demandes reçues'];

    private readonly users = signal<UserWithStatusDTO[]>([]);

    /** On the friends tab, the closeness of each friendship, by user id. */
    readonly friendships = signal<ReadonlyMap<string, FriendSummary>>(new Map());

    readonly searchQuery = signal('');
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);
    readonly activeTabIndex = signal(0);

    readonly isMobile = toSignal(
        this.breakpointObserver.observe([Breakpoints.Handset]).pipe(map(result => result.matches)),
        { initialValue: false }
    );

    /** Set by the route: `/friends` shows relationships, `/users` shows everyone. */
    readonly isFriendsMode = signal(false);

    /**
     * Derived rather than recomputed by hand in two methods, which had to agree on what an empty
     * query means and on resetting the list after every load.
     */
    readonly filteredUsers = computed(() => {
        const query = this.searchQuery().toLowerCase().trim();
        const users = this.users();

        if (!query) {
            return users;
        }
        return users.filter(user => user.userName.toLowerCase().includes(query));
    });

    ngOnInit(): void {
        this.route.data
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(data => {
                this.isFriendsMode.set(data['mode'] === 'friends');
                this.loadUsers();
            });
    }

    nextTab(): void {
        if (this.activeTabIndex() < UserSearchComponent.TAB_FILTERS.length - 1) {
            this.onTabChange(this.activeTabIndex() + 1);
        }
    }

    prevTab(): void {
        if (this.activeTabIndex() > 0) {
            this.onTabChange(this.activeTabIndex() - 1);
        }
    }

    openAddFriendDialog(): void {
        const dialogRef = this.dialog.open(AddFriendDialogComponent, {
            width: '450px',
            maxWidth: '95vw'
        });

        dialogRef.afterClosed()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(result => {
                if (result) {
                    this.loadUsers();
                }
            });
    }

    onTabChange(index: number): void {
        this.activeTabIndex.set(index);
        this.loadUsers();
    }

    private filterForActiveTab(): FriendshipFilter {
        return UserSearchComponent.TAB_FILTERS[this.activeTabIndex()] ?? 'FRIENDS';
    }

    loadUsers(): void {
        this.isLoading.set(true);
        this.error.set(null);

        const friendsMode = this.isFriendsMode();
        if (friendsMode && this.filterForActiveTab() === 'FRIENDS') {
            this.loadFriendships();
            return;
        }
        this.friendships.set(new Map());
        const request$ = friendsMode
            ? this.socialService.searchUsers(this.filterForActiveTab())
            : this.socialService.searchUsers();

        request$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (users) => {
                    // In friends mode the API answers without a relation status, because the tab
                    // already decided what it is: the filter that was asked for is the answer.
                    if (friendsMode) {
                        const inferredStatus = this.filterForActiveTab();
                        this.users.set(users.map(user => ({ ...user, relationStatus: inferredStatus })));
                    } else {
                        this.users.set(users);
                    }
                    this.isLoading.set(false);
                },
                error: (err) => {
                    this.logger.error('UserSearchComponent', 'Error loading users:', err);
                    this.error.set('Impossible de charger les utilisateurs');
                    this.isLoading.set(false);
                }
            });
    }

    /** The friends tab reads the friendships, which carry the closeness the cards show. */
    private loadFriendships(): void {
        this.socialService.listFriendships()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (friendships) => {
                    this.friendships.set(new Map(friendships.map(friendship => [friendship.userId, friendship])));
                    this.users.set(friendships.map(friendship => ({
                        userId: friendship.userId,
                        userName: friendship.userName,
                        profilePicUrl: friendship.profilePicUrl,
                        relationStatus: 'FRIENDS'
                    })));
                    this.isLoading.set(false);
                },
                error: (err) => {
                    this.logger.error('UserSearchComponent', 'Error loading friendships:', err);
                    this.error.set('Impossible de charger vos amis');
                    this.isLoading.set(false);
                }
            });
    }

    friendshipOf(user: UserWithStatusDTO): FriendSummary | null {
        return this.friendships().get(user.userId) ?? null;
    }

    onClosenessChange(change: ClosenessChange): void {
        this.runThenReload(
            this.socialService.requestCloseness(change.user.userId, change.closeness),
            'Error changing closeness:',
            'Impossible de changer la proximité'
        );
    }

    onClosenessAnswer(answer: ClosenessAnswer): void {
        const request$ = answer.accept
            ? this.socialService.acceptCloseness(answer.user.userId)
            : this.socialService.declineCloseness(answer.user.userId);
        this.runThenReload(request$, 'Error answering closeness proposal:', 'Impossible de répondre à la proposition');
    }

    /**
     * Not implemented.
     *
     * <p>A friend request is sent by tag through {@link AddFriendDialogComponent}, not from a
     * card: the search results do not carry the hashtag that `wely-social` needs to identify a
     * user. The card's Add button therefore does nothing yet, and this traces rather than
     * pretending to succeed.
     */
    onAddFriend(user: UserWithStatusDTO): void {
        this.logger.debug('UserSearchComponent', 'Add friend:', user);
    }

    onAcceptFriend(user: UserWithStatusDTO): void {
        this.runThenReload(
            this.socialService.acceptFriend(user.userId),
            'Error accepting friend request:',
            "Impossible d'accepter la demande"
        );
    }

    onDeclineFriend(user: UserWithStatusDTO): void {
        this.runThenReload(
            this.socialService.rejectFriend(user.userId),
            'Error declining friend request:',
            'Impossible de refuser la demande'
        );
    }

    onRemoveFriend(user: UserWithStatusDTO): void {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            width: '400px',
            maxWidth: '95vw',
            data: {
                title: 'Supprimer l\'ami',
                message: `Êtes-vous sûr de vouloir supprimer ${user.userName} de vos amis ?`,
                confirmText: 'Supprimer',
                cancelText: 'Annuler',
                isDestructive: true
            },
            panelClass: 'confirm-dialog-panel'
        });

        dialogRef.afterClosed()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(confirm => {
                if (confirm) {
                    this.runThenReload(
                        this.socialService.removeFriend(user.userId),
                        'Error removing friend:',
                        "Impossible de supprimer l'ami"
                    );
                }
            });
    }

    onChat(user: UserWithStatusDTO): void {
        this.isLoading.set(true);

        this.chatService.getConversation(user.userId.toString())
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (conversation: Conversation) => this.router.navigate(['/chat', conversation.id]),
                error: (err: unknown) => {
                    this.logger.error('UserSearchComponent', 'Error getting conversation:', err);
                    this.isLoading.set(false);
                    this.error.set("Impossible d'ouvrir la discussion");
                }
            });
    }

    /**
     * Runs a relationship change, then reloads the list so the tabs reflect it.
     *
     * <p>Three methods used to repeat this shape, each with its own copy of the loading flag and
     * error handling. `loadUsers` clears the flag on the way back, which is why success does not
     * touch it here.
     */
    private runThenReload(request$: Observable<unknown>, logMessage: string, userMessage: string): void {
        this.isLoading.set(true);

        request$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => this.loadUsers(),
                error: (err: unknown) => {
                    this.logger.error('UserSearchComponent', logMessage, err);
                    this.isLoading.set(false);
                    // 409: the friend changed the friendship at the same time.
                    this.error.set(err instanceof HttpErrorResponse && err.status === 409
                        ? 'Votre ami a modifié votre relation au même moment. Rechargez et réessayez.'
                        : userMessage);
                }
            });
    }
}
