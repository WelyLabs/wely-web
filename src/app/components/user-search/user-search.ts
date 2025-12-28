import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { UserService } from '../../services/user.service';
import { SocialService } from '../../services/social.service';
import { UserWithStatusDTO } from '../../models/user.model';
import { UserCardComponent } from '../user-card/user-card';
import { AddFriendDialogComponent } from '../add-friend-dialog/add-friend-dialog';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog';

@Component({
    selector: 'app-user-search',
    standalone: true,
    imports: [
        CommonModule,
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
    users: UserWithStatusDTO[] = [];
    filteredUsers: UserWithStatusDTO[] = [];
    searchQuery = '';
    isLoading = false;
    error: string | null = null;
    isFriendsMode = false;
    activeTabIndex = 0;
    isMobile = false;
    tabLabels = ['Amis', 'Demandes envoyées', 'Demandes reçues'];

    constructor(
        private userService: UserService,
        private socialService: SocialService,
        private route: ActivatedRoute,
        private breakpointObserver: BreakpointObserver,
        private dialog: MatDialog
    ) { }

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

    loadUsers() {
        this.isLoading = true;
        this.error = null;

        let request$;

        if (this.isFriendsMode) {
            let status = 'FRIENDS';
            if (this.activeTabIndex === 1) status = 'PENDING_OUTGOING';
            if (this.activeTabIndex === 2) status = 'PENDING_INCOMING';
            request$ = this.socialService.searchUsers(status);
        } else {
            request$ = this.socialService.searchUsers();
        }

        request$.subscribe({
            next: (users) => {
                // If in friends mode, manually inject the status as the API doesn't return it
                if (this.isFriendsMode) {
                    let inferredStatus: 'FRIENDS' | 'PENDING_OUTGOING' | 'PENDING_INCOMING' = 'FRIENDS';
                    if (this.activeTabIndex === 1) inferredStatus = 'PENDING_OUTGOING';
                    if (this.activeTabIndex === 2) inferredStatus = 'PENDING_INCOMING';

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
                console.error('Error loading users:', err);
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
        console.log('Add friend:', user);
    }

    onAcceptFriend(user: UserWithStatusDTO) {
        this.isLoading = true;
        this.socialService.acceptFriend(user.userId).subscribe({
            next: () => {
                this.loadUsers();
            },
            error: (err: any) => {
                console.error('Error accepting friend request:', err);
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
            error: (err: any) => {
                console.error('Error declining friend request:', err);
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
                    error: (err: any) => {
                        console.error('Error removing friend:', err);
                        this.isLoading = false;
                        this.error = 'Impossible de supprimer l\'ami';
                    }
                });
            }
        });
    }
}
