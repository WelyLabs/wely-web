import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../services/user.service';
import { UserWithStatusDTO } from '../../models/user.model';

@Component({
    selector: 'app-user-search',
    standalone: true,
    imports: [
        CommonModule,
        MatIconModule,
        MatButtonModule,
        MatInputModule,
        MatFormFieldModule,
        FormsModule
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

    // Mock names removed as userName is provided

    constructor(private userService: UserService) { }

    ngOnInit() {
        this.loadUsers();
    }

    loadUsers() {
        this.isLoading = true;
        this.error = null;

        this.userService.searchUsers().subscribe({
            next: (users) => {
                this.users = users;
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

    getInitials(user: UserWithStatusDTO): string {
        return user.userName.substring(0, 2).toUpperCase();
    }

    // joinedDate removed from DTO
    /*
    formatJoinedDate(dateString: string): string {
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    */

    shouldShowButton(status: string): boolean {
        return status === 'NOT_FRIENDS';
    }

    onAddFriend(user: UserWithStatusDTO) {
        // To be implemented later
        console.log('Add friend:', user);
    }

    onAcceptFriend(user: UserWithStatusDTO) {
        // To be implemented later
        console.log('Accept friend request:', user);
    }
}
