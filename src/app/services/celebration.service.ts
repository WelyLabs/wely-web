import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Closeness } from '../models/friendship.model';

/** How long the celebration stays on screen. */
export const CELEBRATION_MS = 2_800;

/** A friendship that just went up a level, accepted in the app. */
export interface ClosenessCelebration {
  /** Tells two celebrations in a row apart, so the second one replays. */
  id: number;
  name: string;
  closeness: Closeness;
}

/**
 * Celebrations the whole app can trigger and the layout draws: a short burst of hearts when a
 * closeness upgrade is accepted. One at a time; a new one replaces the last.
 */
@Injectable({ providedIn: 'root' })
export class CelebrationService {
  private readonly current = signal<ClosenessCelebration | null>(null);
  readonly closeness = this.current.asReadonly();

  private sequence = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearTimer());
  }

  /** « Léa et toi êtes maintenant intimes »; only an upgrade is worth it, FRIEND is not one. */
  celebrateCloseness(name: string, closeness: Closeness | null | undefined): void {
    if (!closeness || closeness === 'FRIEND') {
      return;
    }
    this.clearTimer();
    this.current.set({ id: ++this.sequence, name, closeness });
    this.timer = setTimeout(() => this.dismiss(), CELEBRATION_MS);
  }

  dismiss(): void {
    this.clearTimer();
    this.current.set(null);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
