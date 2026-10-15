import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { finalize } from 'rxjs';

import {
  COMMUNITY_LIMITS,
  Community,
  CommunityRequest,
  CommunityVisibility,
  communityErrorMessage,
} from '../../../models/community.model';
import { CommunityService } from '../../../services/community.service';

/** Creates a community, or edits one when opened with it. Closes with the community as stored. */
@Component({
  selector: 'app-community-form-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './community-form-dialog.html',
  styleUrl: './community-form-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityFormDialogComponent {
  private readonly communities = inject(CommunityService);
  private readonly dialogRef = inject<MatDialogRef<CommunityFormDialogComponent, Community>>(MatDialogRef);
  readonly editing = inject<Community | null>(MAT_DIALOG_DATA, { optional: true });

  readonly limits = COMMUNITY_LIMITS;
  readonly name = signal(this.editing?.name ?? '');
  readonly description = signal(this.editing?.description ?? '');
  readonly visibility = signal<CommunityVisibility>(this.editing?.visibility ?? 'PUBLIC');
  readonly interests = signal<string[]>(this.editing?.interests ?? []);
  readonly interestDraft = signal('');
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly valid = computed(() => {
    const name = this.name().trim();
    return name.length >= this.limits.nameMin && name.length <= this.limits.nameMax
      && this.description().length <= this.limits.descriptionMax;
  });

  /** Enter or a comma turns what was typed into a chip; lower-cased like the backend stores it. */
  addInterest(event?: Event): void {
    event?.preventDefault();
    const value = this.interestDraft().replace(/^#/, '').trim().toLowerCase().slice(0, this.limits.interestMax);
    if (value && !this.interests().includes(value) && this.interests().length < this.limits.interestsMax) {
      this.interests.update((list) => [...list, value]);
    }
    this.interestDraft.set('');
  }

  removeInterest(interest: string): void {
    this.interests.update((list) => list.filter((item) => item !== interest));
  }

  save(): void {
    if (this.interestDraft().trim()) {
      this.addInterest();
    }
    if (!this.valid() || this.saving()) {
      return;
    }
    const request: CommunityRequest = {
      name: this.name().trim(),
      description: this.description().trim() || null,
      interests: this.interests(),
      visibility: this.visibility(),
    };
    this.saving.set(true);
    this.error.set(null);
    const call = this.editing
      ? this.communities.update(this.editing.communityId, request)
      : this.communities.create(request);
    call.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (community) => this.dialogRef.close(community),
      error: (err: HttpErrorResponse) =>
        this.error.set(communityErrorMessage(err.error?.code) ?? "L'enregistrement a échoué, réessayez."),
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
