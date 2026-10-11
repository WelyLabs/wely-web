import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { finalize } from 'rxjs';
import { EventService, FreeRange } from '../../services/event.service';
import { SocialService } from '../../services/social.service';
import { UserNodeDTO } from '../../models/user.model';
import { LoggerService } from '../../core/logging/logger.service';

/** A period of time, used both for the search window and for the slot picked in it. */
export interface TimeWindow {
    start: Date;
    end: Date;
}

const MINUTE_MS = 60_000;
/** Durations offered, in minutes. Only those fitting in the window are shown. */
const DURATIONS = [15, 30, 60, 90, 120, 180, 240];
const DEFAULT_DURATION = 60;
/** Same cap as the backend, so the user cannot build a search that is bound to be rejected. */
export const MAX_FRIENDS = 20;

/**
 * Searches, inside a window, the periods where the caller and the selected friends are all free,
 * and hands back the slot the user picks.
 */
@Component({
    selector: 'app-find-slot',
    standalone: true,
    imports: [CommonModule, MatIconModule],
    templateUrl: './find-slot.html',
    styleUrl: './find-slot.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FindSlotComponent {
    private readonly eventService = inject(EventService);
    private readonly socialService = inject(SocialService);
    private readonly logger = inject(LoggerService);
    private readonly destroyRef = inject(DestroyRef);

    readonly window = input.required<TimeWindow>();
    readonly picked = output<TimeWindow>();

    readonly friends = signal<UserNodeDTO[] | null>(null);
    readonly friendsError = signal(false);
    readonly selected = signal<ReadonlySet<string>>(new Set());

    readonly durations = computed(() => {
        const { start, end } = this.window();
        const fitting = DURATIONS.filter(minutes => minutes * MINUTE_MS <= end.getTime() - start.getTime());
        return fitting.length > 0 ? fitting : [DURATIONS[0]];
    });
    readonly durationMinutes = linkedSignal(() => {
        const durations = this.durations();
        return durations.includes(DEFAULT_DURATION) ? DEFAULT_DURATION : durations[durations.length - 1];
    });

    readonly searching = signal(false);
    /** Null until a search has answered; reset whenever the criteria change. */
    readonly results = signal<FreeRange[] | null>(null);
    readonly errorMessage = signal<string | null>(null);

    readonly canSearch = computed(() =>
        this.selected().size > 0 && this.selected().size <= MAX_FRIENDS && !this.searching());

    constructor() {
        this.socialService.listFriends().pipe(
            takeUntilDestroyed(this.destroyRef)
        ).subscribe({
            next: friends => this.friends.set([...friends].sort((a, b) => a.userName.localeCompare(b.userName))),
            error: (err: unknown) => {
                this.logger.error('FindSlotComponent', 'Could not load friends', err);
                this.friendsError.set(true);
            }
        });
    }

    isSelected(userId: string): boolean {
        return this.selected().has(userId);
    }

    toggle(userId: string): void {
        this.selected.update(current => {
            const next = new Set(current);
            if (!next.delete(userId)) {
                next.add(userId);
            }
            return next;
        });
        this.clearResults();
    }

    setDuration(minutes: number): void {
        this.durationMinutes.set(minutes);
        this.clearResults();
    }

    search(): void {
        if (!this.canSearch()) {
            return;
        }
        const { start, end } = this.window();
        this.searching.set(true);
        this.errorMessage.set(null);

        this.eventService.findFreeSlots({
            friendIds: [...this.selected()],
            start,
            end,
            durationMinutes: this.durationMinutes()
        }).pipe(
            finalize(() => this.searching.set(false)),
            takeUntilDestroyed(this.destroyRef)
        ).subscribe({
            next: ranges => this.results.set(ranges),
            error: (err: HttpErrorResponse) => {
                this.logger.error('FindSlotComponent', 'Free slot search failed', err);
                this.results.set(null);
                this.errorMessage.set(this.messageFor(err.status));
            }
        });
    }

    /** Picks the start of a free range: the event takes the chosen duration from there. */
    pick(range: FreeRange): void {
        this.picked.emit({
            start: range.start,
            end: new Date(range.start.getTime() + this.durationMinutes() * MINUTE_MS)
        });
    }

    sameDay(range: FreeRange): boolean {
        return range.start.toDateString() === range.end.toDateString();
    }

    formatDuration(minutes: number): string {
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        if (hours === 0) {
            return `${rest} min`;
        }
        return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
    }

    private clearResults(): void {
        this.results.set(null);
        this.errorMessage.set(null);
    }

    /** Maps the status the backend answered to something the user can act on. */
    private messageFor(status: number): string {
        switch (status) {
            case 400:
                return 'Recherche impossible sur cette plage.';
            case 403:
                return "Une des personnes choisies ne fait plus partie de vos amis.";
            case 502:
                return 'Vos amis sont momentanément introuvables, réessayez dans un instant.';
            default:
                return 'Une erreur est survenue pendant la recherche.';
        }
    }
}
