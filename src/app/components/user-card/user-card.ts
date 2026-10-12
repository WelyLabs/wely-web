import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { UserWithStatusDTO } from '../../models/user.model';
import { CLOSENESS_HINTS, CLOSENESS_LABELS, CLOSENESS_LEVELS, Closeness, FriendSummary, isAbove } from '../../models/friendship.model';

/** A closeness the user asked for on a friend's card. */
export interface ClosenessChange {
    user: UserWithStatusDTO;
    closeness: Closeness;
}

/** The user's answer to a closeness the friend proposed. */
export interface ClosenessAnswer {
    user: UserWithStatusDTO;
    accept: boolean;
}

/** One entry of the closeness menu: what choosing it does, worded from the current level. */
interface ClosenessOption {
    closeness: Closeness;
    label: string;
    hint: string;
}

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
    /** Set on the friends tab only: the closeness of the friendship and any pending proposal. */
    readonly friendship = input<FriendSummary | null>(null);
    /** On a pending request, the title of the event the two met at. */
    readonly metAt = input<string | null>(null);

    readonly addFriend = output<UserWithStatusDTO>();
    readonly acceptFriend = output<UserWithStatusDTO>();
    readonly declineFriend = output<UserWithStatusDTO>();
    readonly removeFriend = output<UserWithStatusDTO>();
    readonly chat = output<UserWithStatusDTO>();
    readonly closenessChange = output<ClosenessChange>();
    readonly closenessAnswer = output<ClosenessAnswer>();

    readonly closenessLabel = computed(() => {
        const friendship = this.friendship();
        return friendship ? CLOSENESS_LABELS[friendship.closeness] : null;
    });

    /** Set when the friend proposed a closer level and waits for this user's answer. */
    readonly incomingProposal = computed(() => {
        const friendship = this.friendship();
        return friendship?.proposal && friendship.proposedByFriend ? CLOSENESS_LABELS[friendship.proposal] : null;
    });

    /** Set when this user proposed a closer level and waits for the friend. */
    readonly outgoingProposal = computed(() => {
        const friendship = this.friendship();
        return friendship?.proposal && !friendship.proposedByFriend ? CLOSENESS_LABELS[friendship.proposal] : null;
    });

    /**
     * Every other level, worded for what choosing it does: above is a proposal the friend has to
     * accept, below applies at once.
     */
    readonly closenessOptions = computed<ClosenessOption[]>(() => {
        const friendship = this.friendship();
        if (!friendship) {
            return [];
        }
        return CLOSENESS_LEVELS
            .filter(level => level !== friendship.closeness && level !== this.ownProposal())
            .map(level => ({
                closeness: level,
                label: isAbove(level, friendship.closeness)
                    ? `Proposer : ${CLOSENESS_LABELS[level]}`
                    : `Redescendre à ${CLOSENESS_LABELS[level]}`,
                hint: CLOSENESS_HINTS[level]
            }));
    });

    private readonly ownProposal = computed(() => {
        const friendship = this.friendship();
        return friendship?.proposal && !friendship.proposedByFriend ? friendship.proposal : null;
    });

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

    onClosenessClick(closeness: Closeness): void {
        this.closenessChange.emit({ user: this.user(), closeness });
    }

    /** Asking for the current level again is how a pending proposal of one's own is withdrawn. */
    onWithdrawProposalClick(): void {
        const friendship = this.friendship();
        if (friendship) {
            this.closenessChange.emit({ user: this.user(), closeness: friendship.closeness });
        }
    }

    onAnswerClick(accept: boolean): void {
        this.closenessAnswer.emit({ user: this.user(), accept });
    }
}
