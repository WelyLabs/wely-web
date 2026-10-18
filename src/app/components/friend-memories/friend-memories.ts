import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { catchError, map, of, switchMap } from 'rxjs';
import { LoggerService } from '../../core/logging/logger.service';
import { AvatarService } from '../../services/avatar.service';
import { FriendshipInsightsService } from '../../services/friendship-insights.service';
import {
  FriendshipMemories, MemoryEvent, isFriendshipAnniversary, longDateLabel, memoriesHeading, parseInstant
} from '../../models/friendship-insights.model';
import { CLOSENESS_LABELS } from '../../models/friendship.model';
import { avatarColor, initialsOf } from '../../core/ui/avatar';
import { eventTint } from '../../core/ui/event-tint';

/** The page as read: notFriends is wely-events' 404. */
export interface MemoriesPage {
  state: 'loading' | 'ready' | 'notFriends' | 'error';
  memories: FriendshipMemories | null;
}

/** Pieces of the anniversary's confetti. */
const CONFETTI_PIECES = 14;

/**
 * « 1 an d'amitié avec Léa »: what two friends shared on Wely, from the first outing to the last,
 * and a few highlights. On the anniversary itself, a little confetti.
 */
@Component({
  selector: 'app-friend-memories',
  standalone: true,
  imports: [DatePipe, RouterLink, MatIconModule],
  templateUrl: './friend-memories.html',
  styleUrl: './friend-memories.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FriendMemoriesComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly insights = inject(FriendshipInsightsService);
  private readonly logger = inject(LoggerService);
  private readonly destroyRef = inject(DestroyRef);
  readonly avatars = inject(AvatarService);

  readonly friendId = signal('');
  readonly page = signal<MemoriesPage>({ state: 'loading', memories: null });
  readonly closenessLabels = CLOSENESS_LABELS;
  readonly confetti = Array.from({ length: CONFETTI_PIECES }, (_, i) => i);
  readonly avatarColor = avatarColor;
  readonly initialsOf = initialsOf;
  readonly eventTint = eventTint;

  readonly memories = computed(() => this.page().memories);
  readonly heading = computed(() => {
    const memories = this.memories();
    return memories ? memoriesHeading(memories) : '';
  });
  /** « depuis le 3 mars 2025 ». */
  readonly sinceLabel = computed(() => {
    const since = parseInstant(this.memories()?.since);
    return since ? `depuis ${longDateLabel(since)}` : '';
  });
  readonly anniversary = computed(() => {
    const memories = this.memories();
    return memories ? isFriendshipAnniversary(memories.since, memories.years) : false;
  });
  /** First and last, or only one when they are the same outing. */
  readonly milestones = computed(() => {
    const memories = this.memories();
    if (!memories) {
      return [];
    }
    const { first, last } = memories;
    const milestones: { label: string; event: MemoryEvent }[] = [];
    if (first) {
      milestones.push({ label: 'Votre première sortie', event: first });
    }
    if (last && last.eventId !== first?.eventId) {
      milestones.push({ label: 'Votre dernière sortie', event: last });
    }
    return milestones;
  });

  ngOnInit(): void {
    this.route.paramMap.pipe(
      map(params => params.get('userId') ?? ''),
      switchMap(id => {
        this.friendId.set(id);
        this.page.set({ state: 'loading', memories: null });
        return this.insights.getMemories(id).pipe(
          map((memories): MemoriesPage => ({ state: 'ready', memories })),
          catchError((error: unknown) => {
            if (error instanceof HttpErrorResponse && error.status === 404) {
              return of<MemoriesPage>({ state: 'notFriends', memories: null });
            }
            this.logger.error('FriendMemoriesComponent', 'Could not load the memories', error);
            return of<MemoriesPage>({ state: 'error', memories: null });
          }));
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(page => this.page.set(page));
  }

  dateOf(event: MemoryEvent): Date | null {
    return parseInstant(event.startDate);
  }
}
