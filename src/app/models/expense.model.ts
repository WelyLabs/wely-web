/** An event's shared expenses, as wely-events serves them. Amounts are whole cents. */

export type SplitMode = 'EQUAL' | 'SHARES' | 'EXACT';
export type ExpenseKind = 'EXPENSE' | 'SETTLEMENT';

/** A weight with SHARES, cents with EXACT, unused with EQUAL. */
export interface ExpenseShare {
  userId: string;
  value: number;
}

export interface Expense {
  id: string;
  title: string;
  amountCents: number;
  currency: string;
  paidBy: string;
  createdBy: string;
  kind: ExpenseKind;
  split: SplitMode;
  shares: ExpenseShare[];
  /** What each person owes for it, worked out by the server to the cent. */
  owedCents: Record<string, number>;
  spentAt: Date;
  version: number | null;
  /** The receipt's signed URL; null when there is none. */
  receiptUrl: string | null;
}

export interface ExpenseRequest {
  title: string;
  amountCents: number;
  paidBy: string;
  split: SplitMode;
  shares: ExpenseShare[];
  /** The version read before editing, so a change made meanwhile is refused rather than lost. */
  version?: number | null;
}

/** Positive: owed money. Negative: owes it. */
export interface Balance {
  userId: string;
  netCents: number;
}

export interface Transfer {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

export interface Ledger {
  currency: string;
  totalCents: number;
  balances: Balance[];
  transfers: Transfer[];
}

/** Someone an expense can be paid by or for: an event member, as the page already knows them. */
export interface ExpenseMember {
  id: string;
  name: string;
  initials: string;
  picture?: string;
  /** A deleted account, shown with a neutral avatar. */
  deleted?: boolean;
}
