import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExpenseService } from './expense.service';
import { environment } from '../../environments/environment';
import { Expense, ExpenseRequest, Ledger } from '../models/expense.model';

describe('ExpenseService', () => {
  let service: ExpenseService;
  let httpMock: HttpTestingController;
  const url = `${environment.apiUrl}/events-service/events/ev-1/expenses`;

  const payload = {
    id: 'x1', title: 'Courses', amountCents: 3000, currency: 'EUR', paidBy: 'alice', createdBy: 'alice',
    kind: 'EXPENSE', split: 'EQUAL', shares: [{ userId: 'alice', value: 0 }], owedCents: { alice: 3000 },
    spentAt: '2026-10-13T10:00:00Z', version: 0, receiptUrl: null
  };
  const request: ExpenseRequest = { title: 'Courses', amountCents: 3000, paidBy: 'alice', split: 'EQUAL', shares: [] };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(ExpenseService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list_shouldReadTheEventsExpenses_withDates', () => {
    let result: Expense[] = [];
    service.list('ev-1').subscribe(expenses => result = expenses);

    httpMock.expectOne(url).flush([payload]);

    expect(result).toHaveLength(1);
    expect(result[0].spentAt).toEqual(new Date('2026-10-13T10:00:00Z'));
  });

  it('ledger_shouldReadTheBalances', () => {
    const ledger: Ledger = { currency: 'EUR', totalCents: 0, balances: [], transfers: [] };
    let result: Ledger | null = null;
    service.ledger('ev-1').subscribe(value => result = value);

    httpMock.expectOne(`${url}/ledger`).flush(ledger);

    expect(result).toEqual(ledger);
  });

  it('add_shouldPostTheExpense', () => {
    service.add('ev-1', request).subscribe();

    const call = httpMock.expectOne(url);
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual(request);
    call.flush(payload);
  });

  it('update_shouldPutTheExpense', () => {
    service.update('ev-1', 'x1', request).subscribe();

    const call = httpMock.expectOne(`${url}/x1`);
    expect(call.request.method).toBe('PUT');
    call.flush(payload);
  });

  it('delete_shouldDeleteTheExpense', () => {
    service.delete('ev-1', 'x1').subscribe();

    const call = httpMock.expectOne(`${url}/x1`);
    expect(call.request.method).toBe('DELETE');
    call.flush(null);
  });

  it('settle_shouldPostTheRepayment', () => {
    service.settle('ev-1', 'bob', 'alice', 1000).subscribe();

    const call = httpMock.expectOne(`${url}/settlements`);
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual({ fromUserId: 'bob', toUserId: 'alice', amountCents: 1000 });
    call.flush({ ...payload, kind: 'SETTLEMENT' });
  });

  it('attachReceipt_shouldPutTheFile_andAnswerWithTheNewVersion', () => {
    let result: Expense | undefined;
    service.attachReceipt('ev-1', 'x1', new Blob(['jpeg'], { type: 'image/jpeg' })).subscribe(expense => result = expense);

    const call = httpMock.expectOne(`${url}/x1/receipt`);
    expect(call.request.method).toBe('PUT');
    expect((call.request.body as FormData).get('file')).toBeInstanceOf(Blob);
    call.flush({ ...payload, version: 1, receiptUrl: 'https://media/r.jpg' });

    expect(result?.version).toBe(1);
    expect(result?.receiptUrl).toBe('https://media/r.jpg');
    expect(result?.spentAt).toEqual(new Date('2026-10-13T10:00:00Z'));
  });

  it('removeReceipt_shouldDeleteTheReceipt', () => {
    let done = false;
    service.removeReceipt('ev-1', 'x1').subscribe(() => done = true);

    const call = httpMock.expectOne(`${url}/x1/receipt`);
    expect(call.request.method).toBe('DELETE');
    call.flush(null);

    expect(done).toBe(true);
  });
});
