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

    // Mock names for users until backend provides them
    private mockNames = [
        { firstName: 'Sophie', lastName: 'Martin' },
        { firstName: 'Lucas', lastName: 'Bernard' },
        { firstName: 'Emma', lastName: 'Dubois' },
        { firstName: 'Thomas', lastName: 'Laurent' },
        { firstName: 'Chloé', lastName: 'Simon' },
        { firstName: 'Hugo', lastName: 'Michel' },
        { firstName: 'Léa', lastName: 'Lefebvre' },
        { firstName: 'Nathan', lastName: 'Moreau' },
        { firstName: 'Camille', lastName: 'Girard' },
        { firstName: 'Antoine', lastName: 'Roux' },
        { firstName: 'Manon', lastName: 'Morel' },
        { firstName: 'Alexandre', lastName: 'Fournier' },
        { firstName: 'Sarah', lastName: 'Fontaine' },
        { firstName: 'Maxime', lastName: 'Rousseau' },
        { firstName: 'Julie', lastName: 'Vincent' }
    ];

    constructor(private userService: UserService) { }

    ngOnInit() {
        this.loadUsers();
    }

    loadUsers() {
        this.isLoading = true;
        this.error = null;

        this.userService.searchUsers().subscribe({
            next: (users) => {
                // Assign mock names to users
                this.users = users.map((user, index) => ({
                    ...user,
                    firstName: this.mockNames[index % this.mockNames.length].firstName,
                    lastName: this.mockNames[index % this.mockNames.length].lastName
                }));
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
            const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
            return fullName.includes(query);
        });
    }

    getInitials(user: UserWithStatusDTO): string {
        const first = user.firstName?.[0] || '';
        const last = user.lastName?.[0] || '';
        return (first + last).toUpperCase() || 'U';
    }

    formatJoinedDate(dateString: string): string {
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

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
