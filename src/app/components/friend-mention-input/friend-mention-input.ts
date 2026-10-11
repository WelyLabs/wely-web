import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

/** What the field needs to know of a friend to suggest it. */
export interface MentionableFriend {
    userId: string;
    userName: string;
    hashtag: number;
}

/** Suggestions shown under the field at once. */
const MAX_SUGGESTIONS = 6;
const MENTION_PREFIX = '@';

/**
 * Picks friends by typing `@` and part of their name or tag, as in a message. The selection is
 * the parent's: it comes in through `selected` and every change goes out through
 * `selectedChange`, in the order the friends were mentioned.
 */
@Component({
    selector: 'app-friend-mention-input',
    standalone: true,
    imports: [FormsModule],
    templateUrl: './friend-mention-input.html',
    styleUrl: './friend-mention-input.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FriendMentionInputComponent {
    readonly friends = input.required<readonly MentionableFriend[]>();
    readonly selected = input<readonly string[]>([]);
    /** No more suggestions once this many friends are mentioned. */
    readonly max = input(Number.POSITIVE_INFINITY);
    /** Optional colour per friend id, given to that friend's chip. */
    readonly colors = input<ReadonlyMap<string, string>>(new Map());
    readonly placeholder = input('@ un ami');
    /** Distinct per instance, so two fields on one page keep their label and list apart. */
    readonly fieldId = input('friend-mention');

    readonly selectedChange = output<string[]>();

    /** What is typed, `@` included. */
    readonly query = signal('');

    /** The friends mentioned, in the order they were mentioned. */
    readonly selectedFriends = computed(() => {
        const byId = new Map(this.friends().map(friend => [friend.userId, friend]));
        return this.selected().flatMap(id => byId.get(id) ?? []);
    });

    readonly full = computed(() => this.selected().length >= this.max());

    /** Friends not mentioned yet whose name or tag contains what follows the `@`. */
    readonly suggestions = computed(() => {
        const typed = this.query().trim();
        if (!typed || this.full()) {
            return [];
        }
        const needle = (typed.startsWith(MENTION_PREFIX) ? typed.slice(1) : typed).toLowerCase();
        return this.friends()
            .filter(friend => !this.selected().includes(friend.userId))
            .filter(friend => this.tagOf(friend).toLowerCase().includes(needle))
            .slice(0, MAX_SUGGESTIONS);
    });

    /** The suggestion Enter would pick, moved with the arrow keys; back to the first on each keystroke. */
    readonly activeIndex = linkedSignal({ source: this.suggestions, computation: () => 0 });

    tagOf(friend: MentionableFriend): string {
        return `${friend.userName}#${friend.hashtag}`;
    }

    colorOf(userId: string): string | null {
        return this.colors().get(userId) ?? null;
    }

    mention(friend: MentionableFriend): void {
        this.query.set('');
        if (!this.full() && !this.selected().includes(friend.userId)) {
            this.selectedChange.emit([...this.selected(), friend.userId]);
        }
    }

    remove(userId: string): void {
        this.selectedChange.emit(this.selected().filter(id => id !== userId));
    }

    /** Arrows move through the suggestions, Enter picks one, Backspace on an empty field drops the last mention. */
    onQueryKeydown(event: KeyboardEvent): void {
        const suggestions = this.suggestions();
        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowUp':
                if (suggestions.length > 0) {
                    event.preventDefault();
                    const step = event.key === 'ArrowDown' ? 1 : -1;
                    this.activeIndex.update(index => (index + step + suggestions.length) % suggestions.length);
                }
                break;
            case 'Enter':
                if (suggestions.length > 0) {
                    event.preventDefault();
                    this.mention(suggestions[this.activeIndex()]);
                }
                break;
            case 'Escape':
                this.query.set('');
                break;
            case 'Backspace': {
                const last = this.selected().at(-1);
                if (!this.query() && last) {
                    this.remove(last);
                }
                break;
            }
        }
    }
}
