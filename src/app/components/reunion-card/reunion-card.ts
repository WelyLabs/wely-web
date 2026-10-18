import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { LoggerService } from '../../core/logging/logger.service';
import { AvatarService } from '../../services/avatar.service';
import { FriendshipInsightsService } from '../../services/friendship-insights.service';
import { ReunionCandidate, reunionLine } from '../../models/friendship-insights.model';
import { CLOSENESS_LABELS } from '../../models/friendship.model';
import { avatarColor, initialsOf } from '../../core/ui/avatar';

/**
 * « Ça fait longtemps »: close friends not seen for a while, each with « Proposer une sortie »,
 * which opens the friend page's own proposal, and « Plus tard ». Nothing when there is no one.
 */
@Component({
  selector: 'app-reunion-card',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './reunion-card.html',
  styleUrl: './reunion-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReunionCardComponent implements OnInit {
  private readonly insights = inject(FriendshipInsightsService);
  private readonly router = inject(Router);
  private readonly logger = inject(LoggerService);
  private readonly destroyRef = inject(DestroyRef);
  readonly avatars = inject(AvatarService);

  readonly candidates = signal<ReunionCandidate[]>([]);
  readonly closenessLabels = CLOSENESS_LABELS;
  readonly avatarColor = avatarColor;
  readonly initialsOf = initialsOf;
  readonly lineOf = reunionLine;

  ngOnInit(): void {
    this.insights.getReunions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: candidates => this.candidates.set(candidates),
      // A suggestion, not the page: it simply does not show.
      error: (error: unknown) => this.logger.warn('ReunionCardComponent', 'Could not load the reunion suggestions', error)
    });
  }

  /** The friend page proposes the outing on the evenings both are free. */
  propose(candidate: ReunionCandidate): void {
    void this.router.navigate(['/friends', candidate.friendId], { queryParams: { propose: 1 } });
  }

  /** Taken off at once; back in the list if wely-events did not record it. */
  later(candidate: ReunionCandidate): void {
    this.candidates.update(candidates => candidates.filter(other => other.friendId !== candidate.friendId));
    this.insights.dismissReunion(candidate.friendId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      error: (error: unknown) => {
        this.logger.error('ReunionCardComponent', 'Could not snooze the suggestion', error);
        this.candidates.update(candidates => [...candidates, candidate]);
      }
    });
  }
}
