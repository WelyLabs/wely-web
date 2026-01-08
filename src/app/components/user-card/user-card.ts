import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { UserWithStatusDTO } from '../../models/user.model';

@Component({
    selector: 'app-user-card',
    standalone: true,
    imports: [CommonModule, MatIconModule, MatButtonModule, MatMenuModule],
    templateUrl: './user-card.html',
    styleUrl: './user-card.scss'
})
export class UserCardComponent {
    @Input() user!: UserWithStatusDTO;
    @Input() showFriendBadge = true;
    @Output() addFriend = new EventEmitter<UserWithStatusDTO>();
    @Output() acceptFriend = new EventEmitter<UserWithStatusDTO>();
    @Output() declineFriend = new EventEmitter<UserWithStatusDTO>();
    @Output() removeFriend = new EventEmitter<UserWithStatusDTO>();
    @Output() chat = new EventEmitter<UserWithStatusDTO>();

    getInitials(user: UserWithStatusDTO): string {
        return user.userName ? user.userName.substring(0, 2).toUpperCase() : 'U';
    }

    onAddClick() {
        this.addFriend.emit(this.user);
    }

    onAcceptClick() {
        this.acceptFriend.emit(this.user);
    }

    onDeclineClick() {
        this.declineFriend.emit(this.user);
    }

    onRemoveFriendClick() {
        this.removeFriend.emit(this.user);
    }

    onChatClick() {
        this.chat.emit(this.user);
    }
}
