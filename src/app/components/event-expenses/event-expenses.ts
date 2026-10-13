import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { Expense, ExpenseMember, Ledger, Transfer } from '../../models/expense.model';
import { ExpenseService } from '../../services/expense.service';
import { LoggerService } from '../../core/logging/logger.service';
import { PendingTrailDirective } from '../../core/ui/pending-trail.directive';
import { avatarColor, initialsOf } from '../../core/ui/avatar';
import { formatCents } from '../../core/ui/money';
import { ExpenseDialogComponent, ExpenseDialogData, ExpenseDialogResult } from '../expense-dialog/expense-dialog';
import { PhotoViewerComponent, PhotoViewerData, PhotoViewerResult } from '../photo-viewer/photo-viewer';
import { eventMediaError } from '../../core/ui/event-media-errors';

/** How many expenses show before « Tout voir ». */
export const EXPENSES_PREVIEW_SIZE = 4;

/** Someone who appears in the accounts but no longer takes part. */
const FORMER_MEMBER = 'Ancien participant';

/**
 * An event's shared expenses: the total, where the viewer stands, the payments that would settle
 * everything, and the latest expenses. Members only: the page does not show it to a guest, and
 * wely-events would answer 404 anyway.
 */
@Component({
  selector: 'app-event-expenses',
  standalone: true,
  imports: [MatIconModule, PendingTrailDirective],
  templateUrl: './event-expenses.html',
  styleUrl: './event-expenses.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventExpensesComponent implements OnInit {
  private readonly expenseService = inject(ExpenseService);
  private readonly dialog = inject(MatDialog);
  private readonly logger = inject(LoggerService);
  private readonly destroyRef = inject(DestroyRef);

  readonly eventId = input.required<string>();
  readonly members = input.required<ExpenseMember[]>();
  readonly meId = input.required<string>();
  readonly isOrganizer = input(false);

  readonly expenses = signal<Expense[]>([]);
  readonly ledger = signal<Ledger | null>(null);
  readonly state = signal<'loading' | 'ready' | 'unavailable'>('loading');
  readonly showAll = signal(false);
  /** Payments being recorded, by `from→to`. */
  readonly settling = signal<ReadonlySet<string>>(new Set());
  /** Repayments being taken back, by id. */
  readonly undoing = signal<ReadonlySet<string>>(new Set());

  readonly formatCents = formatCents;
  readonly avatarColor = avatarColor;

  private readonly byId = computed(() => new Map(this.members().map(member => [member.id, member])));

  /** What the viewer is owed (positive) or owes (negative). */
  readonly myBalance = computed(() => this.ledger()?.balances.find(balance => balance.userId === this.meId())?.netCents ?? 0);

  readonly balanceLabel = computed(() => {
    const balance = this.myBalance();
    return balance > 0 ? `On te doit ${formatCents(balance)}`
      : balance < 0 ? `Tu dois ${formatCents(-balance)}`
      : 'Tu es à jour';
  });

  /** The viewer's own payments first: those are the ones they can act on. */
  readonly transfers = computed(() => {
    const me = this.meId();
    const all = this.ledger()?.transfers ?? [];
    const mine = (transfer: Transfer) => transfer.fromUserId === me || transfer.toUserId === me;
    return [...all.filter(mine), ...all.filter(transfer => !mine(transfer))];
  });

  readonly visibleExpenses = computed(() =>
    this.showAll() ? this.expenses() : this.expenses().slice(0, EXPENSES_PREVIEW_SIZE));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    forkJoin({ expenses: this.expenseService.list(this.eventId()), ledger: this.expenseService.ledger(this.eventId()) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ expenses, ledger }) => {
          this.expenses.set(expenses);
          this.ledger.set(ledger);
          this.state.set('ready');
        },
        error: (error: unknown) => {
          this.state.set('unavailable');
          this.logger.error('EventExpensesComponent', 'Could not load the expenses', error);
        }
      });
  }

  name(userId: string): string {
    return this.byId().get(userId)?.name ?? FORMER_MEMBER;
  }

  member(userId: string): ExpenseMember {
    return this.byId().get(userId) ?? { id: userId, name: FORMER_MEMBER, initials: initialsOf(FORMER_MEMBER) };
  }

  /** « Léa → toi », or « Léa → Bob ». */
  transferLabel(transfer: Transfer): string {
    const name = (id: string) => id === this.meId() ? 'toi' : this.name(id);
    const from = transfer.fromUserId === this.meId() ? 'Toi' : this.name(transfer.fromUserId);
    return `${from} → ${name(transfer.toUserId)}`;
  }

  canSettle(transfer: Transfer): boolean {
    return transfer.fromUserId === this.meId() || transfer.toUserId === this.meId();
  }

  isSettling(transfer: Transfer): boolean {
    return this.settling().has(settlingKey(transfer));
  }

  /** The author or the organizer; a settlement is not edited, only deleted (from its dialog). */
  canEdit(expense: Expense): boolean {
    return expense.kind === 'EXPENSE' && (expense.createdBy === this.meId() || this.isOrganizer());
  }

  /** A repayment recorded by mistake: its author or the organizer takes it back. */
  canUndo(expense: Expense): boolean {
    return expense.kind === 'SETTLEMENT' && (expense.createdBy === this.meId() || this.isOrganizer());
  }

  undo(expense: Expense): void {
    if (this.undoing().has(expense.id)) {
      return;
    }
    this.undoing.update(current => new Set(current).add(expense.id));
    const done = () => this.undoing.update(current => {
      const next = new Set(current);
      next.delete(expense.id);
      return next;
    });
    this.expenseService.delete(this.eventId(), expense.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          done();
          this.load();
        },
        error: (error: unknown) => {
          done();
          this.logger.error('EventExpensesComponent', 'Could not take the repayment back', error);
        }
      });
  }

  settle(transfer: Transfer): void {
    const key = settlingKey(transfer);
    if (this.settling().has(key)) {
      return;
    }
    this.settling.update(current => new Set(current).add(key));
    const done = () => this.settling.update(current => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    this.expenseService.settle(this.eventId(), transfer.fromUserId, transfer.toUserId, transfer.amountCents)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          done();
          this.load();
        },
        error: (error: unknown) => {
          done();
          this.logger.error('EventExpensesComponent', 'Could not record the repayment', error);
        }
      });
  }

  add(): void {
    this.open({ eventId: this.eventId(), members: this.members(), meId: this.meId() });
  }

  edit(expense: Expense): void {
    if (!this.canEdit(expense)) {
      return;
    }
    this.open({ eventId: this.eventId(), members: this.members(), meId: this.meId(), expense, canDelete: true });
  }

  /** The receipt full size; its author or the organizer may take it off. */
  openReceipt(expense: Expense): void {
    const url = expense.receiptUrl;
    if (!url) {
      return;
    }
    const data: PhotoViewerData = {
      url,
      title: expense.title,
      subtitle: `Ticket · payé par ${this.name(expense.paidBy)}`,
      canRemove: this.canEdit(expense),
      remove: () => this.expenseService.removeReceipt(this.eventId(), expense.id),
      removeLabel: 'Retirer le ticket',
      confirmLabel: 'Retirer le ticket ?',
      removeError: error => eventMediaError(error, 'Le ticket n’a pas pu être retiré. Réessaie dans un instant.')
    };
    this.dialog.open<PhotoViewerComponent, PhotoViewerData, PhotoViewerResult>(PhotoViewerComponent, {
      data,
      maxWidth: '96vw',
      panelClass: 'photo-viewer-panel'
    }).afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        if (result === 'removed') {
          this.load();
        }
      });
  }

  private open(data: ExpenseDialogData): void {
    this.dialog.open<ExpenseDialogComponent, ExpenseDialogData, ExpenseDialogResult>(ExpenseDialogComponent, {
      data,
      width: '520px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable'
    }).afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        if (result) {
          this.load();
        }
      });
  }
}

function settlingKey(transfer: Transfer): string {
  return `${transfer.fromUserId}→${transfer.toUserId}`;
}
