import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CelebrationService } from '../../services/celebration.service';

/** Hearts rising from the card. */
const HEARTS = 12;

/**
 * The burst shown when a closeness upgrade is accepted: hearts for an intimate friend, a warm
 * glow for a close one. With reduced motion, only the card shows, still.
 */
@Component({
  selector: 'app-closeness-celebration',
  standalone: true,
  templateUrl: './closeness-celebration.html',
  styleUrl: './closeness-celebration.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClosenessCelebrationComponent {
  private readonly celebrations = inject(CelebrationService);

  /** In a list of one, so that a new celebration is a new element and its animation replays. */
  readonly shown = computed(() => {
    const celebration = this.celebrations.closeness();
    return celebration ? [celebration] : [];
  });
  readonly hearts = Array.from({ length: HEARTS }, (_, i) => i);

  dismiss(): void {
    this.celebrations.dismiss();
  }
}
