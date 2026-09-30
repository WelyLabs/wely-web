import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { UserWithStatusDTO } from '../../models/user.model';

/**
 * One user, with the action buttons their relationship status allows.
 *
 * <p>Purely presentational: it reads its user from an input and reports clicks upwards. Every
 * action is the parent's to perform, which is why a card can be rendered from a search result,
 * a friend list or a profile page without knowing which.
 */
@Component({
    selector: 'app-user-card',
    standalone: true,
    imports: [MatIconModule, MatButtonModule, MatMenuModule],
    templateUrl: './user-card.html',
    styleUrl: './user-card.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserCardComponent {
    /** Required: a card with no user has nothing to render, and `input.required` says so at the
     * type level rather than through the `!` that used to hide it. */
    readonly user = input.required<UserWithStatusDTO>();
    readonly showFriendBadge = input(true);

    readonly addFriend = output<UserWithStatusDTO>();
    readonly acceptFriend = output<UserWithStatusDTO>();
    readonly declineFriend = output<UserWithStatusDTO>();
    readonly removeFriend = output<UserWithStatusDTO>();
    readonly chat = output<UserWithStatusDTO>();

    /** Recomputed only when the user changes, where the template used to call a method on every
     * change-detection pass. */
    readonly initials = computed(() => {
        const userName = this.user().userName;
        return userName ? userName.substring(0, 2).toUpperCase() : 'U';
    });

    onAddClick(): void {
        this.addFriend.emit(this.user());
    }

    onAcceptClick(): void {
        this.acceptFriend.emit(this.user());
    }

    onDeclineClick(): void {
        this.declineFriend.emit(this.user());
    }

    onRemoveFriendClick(): void {
        this.removeFriend.emit(this.user());
    }

    onChatClick(): void {
        this.chat.emit(this.user());
    }
}
