import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CLOSENESS_LABELS, FriendSummary } from '../../models/friendship.model';

/** Picks the friend whose calendar is laid over the week, or none. */
@Component({
    selector: 'app-friend-overlay-picker',
    standalone: true,
    imports: [FormsModule, MatIconModule],
    templateUrl: './friend-overlay-picker.html',
    styleUrl: './friend-overlay-picker.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FriendOverlayPickerComponent {
    readonly friendships = input.required<FriendSummary[]>();
    readonly selected = input<string | null>(null);
    readonly selectedChange = output<string | null>();

    closenessLabel(friend: FriendSummary): string {
        return CLOSENESS_LABELS[friend.closeness];
    }
}
