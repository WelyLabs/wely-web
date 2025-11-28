import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule } from '@angular/forms';
import { BusinessUser } from '../../models/business-user.model';
import { MOCK_FRIENDS } from '../../models/friends.mock';

@Component({
    selector: 'app-friends-list',
    standalone: true,
    imports: [
        CommonModule,
        MatIconModule,
        MatButtonModule,
        MatInputModule,
        MatFormFieldModule,
        MatMenuModule,
        FormsModule
    ],
    templateUrl: './friends-list.html',
    styleUrl: './friends-list.scss'
})
export class FriendsListComponent implements OnInit {
    friends: BusinessUser[] = [];
    filteredFriends: BusinessUser[] = [];
    searchQuery: string = '';
    isLoading = true;

    ngOnInit() {
        // Simulate API loading
        setTimeout(() => {
            this.friends = MOCK_FRIENDS;
            this.filteredFriends = this.friends;
            this.isLoading = false;
        }, 500);
    }

    filterFriends() {
        if (!this.searchQuery) {
            this.filteredFriends = this.friends;
            return;
        }

        const query = this.searchQuery.toLowerCase();
        this.filteredFriends = this.friends.filter(friend =>
            friend.firstName.toLowerCase().includes(query) ||
            friend.lastName.toLowerCase().includes(query) ||
            friend.jobTitle.toLowerCase().includes(query)
        );
    }

    getInitials(user: BusinessUser): string {
        return (user.firstName[0] + user.lastName[0]).toUpperCase();
    }

    contactFriend(friend: BusinessUser) {
        console.log('Contacting', friend.firstName);
    }

    removeFriend(friend: BusinessUser) {
        // In a real app, this would call an API
        this.friends = this.friends.filter(f => f.id !== friend.id);
        this.filterFriends();
    }
}
