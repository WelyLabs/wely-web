import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Observable } from 'rxjs';

import { LoggerService } from '../../core/logging/logger.service';
import { PendingTrailDirective } from '../../core/ui/pending-trail.directive';

export interface PhotoViewerData {
  url: string;
  /** Who sent it, or what it is: a chat photo's author, an expense's title. */
  title: string;
  /** A date or a detail under the title. */
  subtitle?: string;
  /** Whether the remove button shows; the server checks the right again. */
  canRemove: boolean;
  /** Removes the photo; the viewer closes with 'removed' once it completes. */
  remove?: () => Observable<void>;
  /** The button's label, « Retirer » by default. */
  removeLabel?: string;
  /** The second tap's label, « Retirer pour tous ? » by default. */
  confirmLabel?: string;
  /** What to say when the removal fails; a generic message otherwise. */
  removeError?: (error: unknown) => string | null;
}

/** Closes with 'removed' once the photo is gone. */
export type PhotoViewerResult = 'removed' | undefined;

const DEFAULT_REMOVE_ERROR = 'La photo n’a pas pu être retirée. Réessaie dans un instant.';

/** A photo full size, with a title, removable by whoever may: chat photos, expense receipts. */
@Component({
  selector: 'app-photo-viewer',
  standalone: true,
  imports: [MatDialogModule, MatIconModule, PendingTrailDirective],
  templateUrl: './photo-viewer.html',
  styleUrl: './photo-viewer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PhotoViewerComponent {
  private readonly logger = inject(LoggerService);
  private readonly dialogRef = inject<MatDialogRef<PhotoViewerComponent, PhotoViewerResult>>(MatDialogRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly data = inject<PhotoViewerData>(MAT_DIALOG_DATA);
  readonly removing = signal(false);
  readonly confirming = signal(false);
  readonly errorMessage = signal('');

  /** Two taps: a removal cannot be undone. */
  remove(): void {
    const remove = this.data.remove;
    if (!remove || this.removing()) {
      return;
    }
    if (!this.confirming()) {
      this.confirming.set(true);
      return;
    }
    this.removing.set(true);
    this.errorMessage.set('');
    remove()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.dialogRef.close('removed'),
        error: (error: unknown) => {
          this.removing.set(false);
          this.confirming.set(false);
          this.errorMessage.set(this.data.removeError?.(error) ?? DEFAULT_REMOVE_ERROR);
          this.logger.error('PhotoViewerComponent', 'Could not remove the photo', error);
        }
      });
  }

  close(): void {
    this.dialogRef.close(undefined);
  }
}
