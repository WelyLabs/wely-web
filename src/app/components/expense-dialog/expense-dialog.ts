import { ChangeDetectionStrategy, Component, DestroyRef, WritableSignal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';

import { Expense, ExpenseMember, ExpenseRequest, ExpenseShare, SplitMode } from '../../models/expense.model';
import { ExpenseService } from '../../services/expense.service';
import { LoggerService } from '../../core/logging/logger.service';
import { PendingTrailDirective } from '../../core/ui/pending-trail.directive';
import { centsToInput, formatCents, parseEuros } from '../../core/ui/money';
import { avatarColor } from '../../core/ui/avatar';
import { DELETED_USER_AVATAR_COLOR, DELETED_USER_ICON } from '../../core/ui/deleted-user';
import { PhotoResizer } from '../../core/ui/photo-resize';
import { eventMediaError } from '../../core/ui/event-media-errors';

export interface ExpenseDialogData {
  eventId: string;
  members: ExpenseMember[];
  meId: string;
  /** Set when editing. */
  expense?: Expense;
  /** The author or the organizer: the only ones who may delete. */
  canDelete?: boolean;
}

/** What the dialog closes with: what changed, so the list can reload. */
export type ExpenseDialogResult = 'saved' | 'deleted' | undefined;

const MAX_TITLE_LENGTH = 80;

/** A receipt's longest side once scaled down: enough to read the small print. */
export const RECEIPT_MAX_SIDE = 2000;

/** wely-events' codes, in the words the dialog shows. */
const ERRORS: Record<string, string> = {
  'EVT-BUS-008': 'La dépense n’est pas valide : vérifie le montant et la répartition.',
  'EVT-BUS-009': 'Seul l’auteur de la dépense ou l’organisateur peut la modifier.',
  'EVT-BUS-010': 'Quelqu’un vient de modifier cette dépense. Ferme et rouvre-la pour voir sa version.',
  'EVT-BUS-001': 'Tu ne fais plus partie de cet événement.'
};

/**
 * What each person would owe, for the live preview. The server computes the stored figures; this
 * follows the same rule (equal parts give the leftover cents in id order, shares go to the largest
 * remainder) so what is shown before saving is what is saved.
 */
export function previewOwed(amountCents: number, split: SplitMode, shares: ExpenseShare[]): Map<string, number> {
  const owed = new Map<string, number>();
  if (amountCents <= 0 || shares.length === 0) {
    return owed;
  }
  if (split === 'EXACT') {
    shares.forEach(share => owed.set(share.userId, share.value));
    return owed;
  }
  const weights = shares.map(share => split === 'EQUAL' ? 1 : share.value);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return owed;
  }
  shares.forEach((share, i) => owed.set(share.userId, Math.floor(amountCents * weights[i] / total)));
  const leftover = amountCents - [...owed.values()].reduce((sum, cents) => sum + cents, 0);
  const order = shares
    .map((share, i) => ({ id: share.userId, remainder: split === 'EQUAL' ? 0 : (amountCents * weights[i]) % total }))
    .sort((a, b) => b.remainder - a.remainder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let i = 0; i < leftover; i++) {
    owed.set(order[i].id, (owed.get(order[i].id) ?? 0) + 1);
  }
  return owed;
}

@Component({
  selector: 'app-expense-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule, MatSelectModule,
    PendingTrailDirective],
  templateUrl: './expense-dialog.html',
  styleUrl: './expense-dialog.scss',
  // Signals rather than a FormGroup: the rows come and go with the members ticked, and each derived
  // figure (shares, what is left to split) is a computed of them.
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseDialogComponent {
  private readonly expenseService = inject(ExpenseService);
  private readonly logger = inject(LoggerService);
  private readonly dialogRef = inject<MatDialogRef<ExpenseDialogComponent, ExpenseDialogResult>>(MatDialogRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly photoResizer = inject(PhotoResizer);

  readonly data = inject<ExpenseDialogData>(MAT_DIALOG_DATA);
  readonly editing = this.data.expense !== undefined;
  readonly maxTitleLength = MAX_TITLE_LENGTH;
  readonly modes: { value: SplitMode; label: string }[] = [
    { value: 'EQUAL', label: 'Égal' },
    { value: 'SHARES', label: 'Parts' },
    { value: 'EXACT', label: 'Montants' }
  ];

  /** Who the expense can be for: a deleted account only when the expense already counts them. */
  readonly members = this.data.members.filter(member => !member.deleted
    || (this.data.expense?.shares ?? []).some(share => share.userId === member.id));
  /** Who can have paid: a deleted account only when the expense already says they did. */
  readonly payers = this.data.members.filter(member => !member.deleted || member.id === this.data.expense?.paidBy);

  readonly title = signal(this.data.expense?.title ?? '');
  readonly amountText = signal(this.data.expense ? centsToInput(this.data.expense.amountCents) : '');
  readonly paidBy = signal(this.data.expense?.paidBy ?? this.data.meId);
  readonly split = signal<SplitMode>(this.data.expense?.split ?? 'EQUAL');
  /** Who the expense is for; everyone still holding an account by default. */
  readonly included = signal<ReadonlySet<string>>(new Set(
    this.data.expense ? this.data.expense.shares.map(share => share.userId) : this.members.map(member => member.id)));
  /** Weight per person in SHARES mode. */
  readonly weights = signal<Readonly<Record<string, number>>>(this.initialValues('SHARES', 1));
  /** Typed amount per person in EXACT mode. */
  readonly exactTexts = signal<Readonly<Record<string, string>>>(this.initialExactTexts());

  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly errorMessage = signal('');

  /** The author or the organizer, or anyone adding their own expense. */
  readonly canEditReceipt = !this.editing || this.data.canDelete === true;
  /** A receipt picked, already scaled down, and its local preview. */
  readonly receiptBlob = signal<Blob | null>(null);
  private readonly receiptPreview = signal<string | null>(null);
  /** The stored receipt is to be removed on save. */
  readonly receiptRemoved = signal(false);
  readonly preparingReceipt = signal(false);
  /** The expense once stored: a failed receipt upload is retried without saving it twice. */
  readonly saved = signal<Expense | null>(null);

  readonly receiptShown = computed(() => this.receiptPreview()
    ?? (this.receiptRemoved() ? null : this.data.expense?.receiptUrl ?? null));

  readonly amountCents = computed(() => parseEuros(this.amountText()));

  readonly shares = computed<ExpenseShare[]>(() => this.members
    .filter(member => this.included().has(member.id))
    .map(member => ({
      userId: member.id,
      value: this.split() === 'SHARES' ? this.weights()[member.id] ?? 1
        : this.split() === 'EXACT' ? parseEuros(this.exactTexts()[member.id] ?? '') ?? 0
        : 0
    })));

  readonly owed = computed(() => previewOwed(this.amountCents() ?? 0, this.split(), this.shares()));

  /** EXACT only: what is still to be given to someone, negative when too much was. */
  readonly remaining = computed(() => (this.amountCents() ?? 0)
    - this.shares().reduce((sum, share) => sum + share.value, 0));

  readonly remainingLabel = computed(() => {
    const remaining = this.remaining();
    return remaining === 0 ? 'Le compte est bon'
      : remaining > 0 ? `Reste ${formatCents(remaining)} à répartir`
      : `${formatCents(-remaining)} de trop`;
  });

  readonly invalidReason = computed(() => {
    const amount = this.amountCents();
    if (!this.title().trim()) {
      return 'Donne un titre à la dépense.';
    }
    if (amount === null || amount <= 0) {
      return 'Indique un montant, par exemple 12,50.';
    }
    if (this.shares().length === 0) {
      return 'Coche au moins une personne.';
    }
    if (this.split() === 'EXACT' && this.remaining() !== 0) {
      return this.remainingLabel();
    }
    return null;
  });

  readonly formatCents = formatCents;
  readonly avatarColor = avatarColor;
  readonly deletedAvatarColor = DELETED_USER_AVATAR_COLOR;
  readonly deletedIcon = DELETED_USER_ICON;

  toggle(memberId: string): void {
    this.included.update(current => {
      const next = new Set(current);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  }

  setWeight(memberId: string, value: string): void {
    const weight = Math.max(1, Math.min(100, Math.floor(Number(value)) || 1));
    this.weights.update(current => ({ ...current, [memberId]: weight }));
  }

  setExact(memberId: string, value: string): void {
    this.exactTexts.update(current => ({ ...current, [memberId]: value }));
  }

  constructor() {
    this.destroyRef.onDestroy(() => this.revokePreview());
  }

  /** Scales the picked receipt down at once, so an unreadable file is refused before saving. */
  async onReceiptPicked(pick: Event): Promise<void> {
    const input = pick.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (input) {
      input.value = '';
    }
    if (!file) {
      return;
    }
    this.preparingReceipt.set(true);
    this.errorMessage.set('');
    try {
      const blob = await this.photoResizer.downscale(file, RECEIPT_MAX_SIDE);
      this.revokePreview();
      this.receiptBlob.set(blob);
      this.receiptPreview.set(URL.createObjectURL(blob));
    } catch (error) {
      this.errorMessage.set('Cette image ne peut pas être lue. Essaie un JPEG ou un PNG.');
      this.logger.error('ExpenseDialogComponent', 'Could not read the receipt', error);
    } finally {
      this.preparingReceipt.set(false);
    }
  }

  /** Drops the receipt just picked, or marks the stored one for removal. */
  clearReceipt(): void {
    if (this.receiptBlob()) {
      this.revokePreview();
      this.receiptBlob.set(null);
      return;
    }
    this.receiptRemoved.set(true);
  }

  save(): void {
    if (this.saving()) {
      return;
    }
    const saved = this.saved();
    if (saved) {
      this.sendReceipt(saved);
      return;
    }
    const amountCents = this.amountCents();
    if (this.invalidReason() || amountCents === null) {
      return;
    }
    const request: ExpenseRequest = {
      title: this.title().trim(),
      amountCents,
      paidBy: this.paidBy(),
      split: this.split(),
      shares: this.shares(),
      version: this.data.expense?.version ?? null
    };
    const call: Observable<Expense> = this.data.expense
      ? this.expenseService.update(this.data.eventId, this.data.expense.id, request)
      : this.expenseService.add(this.data.eventId, request);
    this.saving.set(true);
    this.errorMessage.set('');
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: expense => {
        this.saved.set(expense);
        this.sendReceipt(expense);
      },
      error: (error: unknown) => this.fail(this.saving, error)
    });
  }

  remove(): void {
    const expense = this.data.expense;
    if (!expense || this.deleting()) {
      return;
    }
    this.run(this.expenseService.delete(this.data.eventId, expense.id), this.deleting, 'deleted');
  }

  /** Still 'saved' once the expense is stored, even if its receipt was not: the list must reload. */
  close(): void {
    this.dialogRef.close(this.saved() ? 'saved' : undefined);
  }

  /** After the expense: the receipt picked, or the removal asked for, then closes. */
  private sendReceipt(expense: Expense): void {
    const blob = this.receiptBlob();
    const step: Observable<unknown> | null = blob
      ? this.expenseService.attachReceipt(this.data.eventId, expense.id, blob)
      : this.receiptRemoved() && this.data.expense?.receiptUrl
        ? this.expenseService.removeReceipt(this.data.eventId, expense.id)
        : null;
    if (!step) {
      this.saving.set(false);
      this.dialogRef.close('saved');
      return;
    }
    this.saving.set(true);
    this.errorMessage.set('');
    step.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogRef.close('saved');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set('La dépense est enregistrée, mais pas le ticket. '
          + eventMediaError(error, 'Réessaie dans un instant.'));
        this.logger.error('ExpenseDialogComponent', 'Could not update the receipt', error);
      }
    });
  }

  private run(call: Observable<unknown>, pending: WritableSignal<boolean>, result: ExpenseDialogResult): void {
    pending.set(true);
    this.errorMessage.set('');
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        pending.set(false);
        this.dialogRef.close(result);
      },
      error: (error: unknown) => this.fail(pending, error)
    });
  }

  private fail(pending: WritableSignal<boolean>, error: unknown): void {
    pending.set(false);
    const code = error instanceof HttpErrorResponse ? error.error?.code : undefined;
    this.errorMessage.set(ERRORS[code] ?? 'L’enregistrement a échoué. Réessaie dans un instant.');
    this.logger.error('ExpenseDialogComponent', 'Could not save the expense', error);
  }

  private revokePreview(): void {
    const preview = this.receiptPreview();
    if (preview) {
      URL.revokeObjectURL(preview);
      this.receiptPreview.set(null);
    }
  }

  private initialValues(mode: SplitMode, fallback: number): Record<string, number> {
    const expense = this.data.expense;
    return Object.fromEntries(this.data.members.map(member => {
      const share = expense?.split === mode ? expense.shares.find(candidate => candidate.userId === member.id) : undefined;
      return [member.id, share?.value ?? fallback];
    }));
  }

  private initialExactTexts(): Record<string, string> {
    const exact = this.initialValues('EXACT', 0);
    return Object.fromEntries(Object.entries(exact).map(([id, cents]) => [id, cents > 0 ? centsToInput(cents) : '']));
  }
}
