import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { Expense, ExpenseRequest, Ledger } from '../models/expense.model';

/** The wire shape: the date as an ISO instant. */
type ExpensePayload = Omit<Expense, 'spentAt'> & { spentAt: string };

/** An event's shared expenses. Only its members get an answer; wely-events answers 404 to anyone else. */
@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/events-service/events`;

  list(eventId: string): Observable<Expense[]> {
    return this.http.get<ExpensePayload[]>(this.url(eventId)).pipe(map(expenses => expenses.map(toExpense)));
  }

  ledger(eventId: string): Observable<Ledger> {
    return this.http.get<Ledger>(`${this.url(eventId)}/ledger`);
  }

  add(eventId: string, request: ExpenseRequest): Observable<Expense> {
    return this.http.post<ExpensePayload>(this.url(eventId), request).pipe(map(toExpense));
  }

  update(eventId: string, expenseId: string, request: ExpenseRequest): Observable<Expense> {
    return this.http.put<ExpensePayload>(`${this.url(eventId)}/${expenseId}`, request).pipe(map(toExpense));
  }

  delete(eventId: string, expenseId: string): Observable<void> {
    return this.http.delete<void>(`${this.url(eventId)}/${expenseId}`);
  }

  /** Attaches a receipt, already scaled down; answers with the expense and its new version. */
  attachReceipt(eventId: string, expenseId: string, receipt: Blob): Observable<Expense> {
    const form = new FormData();
    form.append('file', receipt, 'receipt.jpg');
    return this.http.put<ExpensePayload>(`${this.url(eventId)}/${expenseId}/receipt`, form).pipe(map(toExpense));
  }

  removeReceipt(eventId: string, expenseId: string): Observable<void> {
    return this.http.delete<void>(`${this.url(eventId)}/${expenseId}/receipt`);
  }

  /** Records that `fromUserId` paid `toUserId` back. */
  settle(eventId: string, fromUserId: string, toUserId: string, amountCents: number): Observable<Expense> {
    return this.http.post<ExpensePayload>(`${this.url(eventId)}/settlements`, { fromUserId, toUserId, amountCents })
      .pipe(map(toExpense));
  }

  private url(eventId: string): string {
    return `${this.apiUrl}/${eventId}/expenses`;
  }
}

function toExpense(payload: ExpensePayload): Expense {
  return { ...payload, spentAt: new Date(payload.spentAt) };
}
