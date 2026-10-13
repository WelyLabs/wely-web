import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { ABOUT_LIMITS, ProfileAbout, UserService } from '../../services/user.service';
import { LoggerService } from '../../core/logging/logger.service';
import { PendingTrailDirective } from '../../core/ui/pending-trail.directive';

/** Ideas offered when the list is empty, so nobody starts from a blank field. */
export const INTEREST_SUGGESTIONS = ['Jeux de société', 'Randonnée', 'Cinéma', 'Concerts', 'Cuisine', 'Sport', 'Voyages'];

/**
 * Edits the profile's presentation: a one-line bio and up to five interests, typed and added with
 * Entrée or picked from suggestions. Closes with what was stored.
 */
@Component({
  selector: 'app-about-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, PendingTrailDirective],
  templateUrl: './about-dialog.html',
  styleUrl: './about-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AboutDialogComponent {
  private readonly userService = inject(UserService);
  private readonly logger = inject(LoggerService);
  private readonly dialogRef = inject<MatDialogRef<AboutDialogComponent, ProfileAbout>>(MatDialogRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly initial = inject<ProfileAbout>(MAT_DIALOG_DATA);

  readonly limits = ABOUT_LIMITS;
  readonly bio = signal(this.initial.bio ?? '');
  readonly interests = signal<readonly string[]>(this.initial.interests);
  readonly draft = signal('');
  readonly saving = signal(false);
  readonly errorMessage = signal('');

  readonly bioLeft = computed(() => ABOUT_LIMITS.bio - this.bio().length);
  readonly full = computed(() => this.interests().length >= ABOUT_LIMITS.interests);
  readonly suggestions = computed(() => INTEREST_SUGGESTIONS
    .filter(idea => !this.interests().some(interest => interest.toLowerCase() === idea.toLowerCase())));

  add(text: string = this.draft()): void {
    const interest = text.trim().replace(/\s+/g, ' ');
    const known = this.interests().some(existing => existing.toLowerCase() === interest.toLowerCase());
    if (!interest || interest.length > ABOUT_LIMITS.interest || known || this.full()) {
      return;
    }
    this.interests.update(current => [...current, interest]);
    this.draft.set('');
  }

  remove(interest: string): void {
    this.interests.update(current => current.filter(existing => existing !== interest));
  }

  /** Entrée adds, a comma too: people type lists that way. */
  onDraftKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.add();
    }
  }

  save(): void {
    if (this.saving() || this.bioLeft() < 0) {
      return;
    }
    // Something typed but not yet added counts: losing it on save would surprise.
    this.add();
    this.saving.set(true);
    this.errorMessage.set('');
    this.userService.updateAbout({ bio: this.bio().trim() || null, interests: [...this.interests()] })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: stored => {
          this.saving.set(false);
          this.dialogRef.close(stored);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set('L’enregistrement a échoué. Réessaie dans un instant.');
          this.logger.error('AboutDialogComponent', 'Could not save the presentation', error);
        }
      });
  }

  close(): void {
    this.dialogRef.close(undefined);
  }
}
