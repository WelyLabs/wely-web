import { Component, OnInit, inject } from '@angular/core';
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
import { UserService } from '../../services/user.service';
import { FriendshipFilter, SocialService } from '../../services/social.service';
import { ChatService } from '../../services/chat.service';
import { UserWithStatusDTO } from '../../models/user.model';
import { Conversation } from '../../models/chat.model';
import { UserCardComponent } from '../user-card/user-card';
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
    styleUrl: './user-search.scss'
})
export class UserSearchComponent implements OnInit {
    private readonly logger = inject(LoggerService);
    private userService = inject(UserService);
    private socialService = inject(SocialService);
    private chatService = inject(ChatService);
    private route = inject(ActivatedRoute);
    private breakpointObserver = inject(BreakpointObserver);
    private dialog = inject(MatDialog);
    private router = inject(Router);

    users: UserWithStatusDTO[] = [];
    filteredUsers: UserWithStatusDTO[] = [];
    searchQuery = '';
    isLoading = false;
    error: string | null = null;
    isFriendsMode = false;
    activeTabIndex = 0;
    isMobile = false;
    tabLabels = ['Amis', 'Demandes envoyées', 'Demandes reçues'];

    ngOnInit() {
        this.breakpointObserver.observe([Breakpoints.Handset]).subscribe(result => {
            this.isMobile = result.matches;
        });

        this.route.data.subscribe(data => {
            this.isFriendsMode = data['mode'] === 'friends';
            this.loadUsers();
        });
    }

    nextTab() {
        if (this.activeTabIndex < 2) {
            this.onTabChange(this.activeTabIndex + 1);
        }
    }

    prevTab() {
        if (this.activeTabIndex > 0) {
            this.onTabChange(this.activeTabIndex - 1);
        }
    }

    openAddFriendDialog() {
        const dialogRef = this.dialog.open(AddFriendDialogComponent, {
            width: '450px',
            maxWidth: '90vw'
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.loadUsers();
            }
        });
    }

    onTabChange(index: number) {
        this.activeTabIndex = index;
        this.loadUsers();
    }

    /** Onglets : Amis, Demandes envoyées, Demandes reçues. */
    private filterForActiveTab(): FriendshipFilter {
        if (this.activeTabIndex === 1) return 'PENDING_OUTGOING';
        if (this.activeTabIndex === 2) return 'PENDING_INCOMING';
        return 'FRIENDS';
    }

    loadUsers() {
        this.isLoading = true;
        this.error = null;

        let request$;

        if (this.isFriendsMode) {
            request$ = this.socialService.searchUsers(this.filterForActiveTab());
        } else {
            request$ = this.socialService.searchUsers();
        }

        request$.subscribe({
            next: (users) => {
                // If in friends mode, manually inject the status as the API doesn't return it
                if (this.isFriendsMode) {
                    const inferredStatus: FriendshipFilter = this.filterForActiveTab();

                    this.users = users.map(user => ({
                        ...user,
                        relationStatus: inferredStatus
                    }));
                } else {
                    this.users = users;
                }

                this.filteredUsers = this.users;
                this.isLoading = false;
            },
            error: (err) => {
                this.logger.error('UserSearchComponent', 'Error loading users:', err);
                this.error = 'Impossible de charger les utilisateurs';
                this.isLoading = false;
            }
        });
    }

    onSearchChange() {
        const query = this.searchQuery.toLowerCase().trim();

        if (!query) {
            this.filteredUsers = this.users;
            return;
        }

        this.filteredUsers = this.users.filter(user => {
            return user.userName.toLowerCase().includes(query);
        });
    }



    onAddFriend(user: UserWithStatusDTO) {
        // To be implemented later
        this.logger.debug('UserSearchComponent', 'Add friend:', user);
    }

    onAcceptFriend(user: UserWithStatusDTO) {
        this.isLoading = true;
        this.socialService.acceptFriend(user.userId).subscribe({
            next: () => {
                this.loadUsers();
            },
            error: (err: unknown) => {
                this.logger.error('UserSearchComponent', 'Error accepting friend request:', err);
                this.isLoading = false;
                this.error = 'Impossible d\'accepter la demande';
            }
        });
    }

    onDeclineFriend(user: UserWithStatusDTO) {
        this.isLoading = true;
        this.socialService.rejectFriend(user.userId).subscribe({
            next: () => {
                this.loadUsers();
            },
            error: (err: unknown) => {
                this.logger.error('UserSearchComponent', 'Error declining friend request:', err);
                this.isLoading = false;
                this.error = 'Impossible de refuser la demande';
            }
        });
    }

    onRemoveFriend(user: UserWithStatusDTO) {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            width: '400px',
            data: {
                title: 'Supprimer l\'ami',
                message: `Êtes-vous sûr de vouloir supprimer ${user.userName} de vos amis ?`,
                confirmText: 'Supprimer',
                cancelText: 'Annuler',
                isDestructive: true
            },
            panelClass: 'confirm-dialog-panel'
        });

        dialogRef.afterClosed().subscribe(confirm => {
            if (confirm) {
                this.isLoading = true;
                this.socialService.removeFriend(user.userId).subscribe({
                    next: () => {
                        this.loadUsers();
                    },
                    error: (err: unknown) => {
                        this.logger.error('UserSearchComponent', 'Error removing friend:', err);
                        this.isLoading = false;
                        this.error = 'Impossible de supprimer l\'ami';
                    }
                });
            }
        });
    }

    onChat(user: UserWithStatusDTO) {
        this.isLoading = true;
        this.chatService.getConversation(user.userId.toString()).subscribe({
            next: (conv: Conversation) => {
                this.router.navigate(['/chat', conv.id]);
            },
            error: (err: unknown) => {
                this.logger.error('UserSearchComponent', 'Error getting conversation:', err);
                this.isLoading = false;
                this.error = 'Impossible d\'ouvrir la discussion';
            }
        });
    }
}
