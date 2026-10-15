import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { EventExpensesComponent, EXPENSES_PREVIEW_SIZE } from './event-expenses';
import { ExpenseService } from '../../services/expense.service';
import { Expense, Ledger } from '../../models/expense.model';
import { PhotoViewerComponent, PhotoViewerData } from '../photo-viewer/photo-viewer';
import { DeletedUsersService } from '../../services/deleted-users.service';
import { deletedUsersStub } from '../../../testing/deleted-users.stub';

describe('EventExpensesComponent', () => {
  let fixture: ComponentFixture<EventExpensesComponent>;
  let component: EventExpensesComponent;
  let expenseService: Record<'list' | 'ledger' | 'settle' | 'delete' | 'removeReceipt', ReturnType<typeof vi.fn>>;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let deletedUsers: ReturnType<typeof deletedUsersStub>;

  const members = [
    { id: 'me', name: 'Toi', initials: 'TO' },
    { id: 'lea', name: 'lea', initials: 'LE' },
    { id: 'bob', name: 'bob', initials: 'BO' }
  ];
  const expense = (overrides: Partial<Expense> = {}): Expense => ({
    id: 'x1', title: 'Courses', amountCents: 3000, currency: 'EUR', paidBy: 'lea', createdBy: 'lea', kind: 'EXPENSE',
    split: 'EQUAL', shares: [{ userId: 'me', value: 0 }, { userId: 'lea', value: 0 }, { userId: 'bob', value: 0 }],
    owedCents: {}, spentAt: new Date('2026-10-13T10:00:00Z'), version: 0, receiptUrl: null, ...overrides
  });
  const ledger: Ledger = {
    currency: 'EUR', totalCents: 3000,
    balances: [{ userId: 'bob', netCents: -1000 }, { userId: 'lea', netCents: 2000 }, { userId: 'me', netCents: -1000 }],
    transfers: [{ fromUserId: 'bob', toUserId: 'lea', amountCents: 1000 }, { fromUserId: 'me', toUserId: 'lea', amountCents: 1000 }]
  };

  const create = (isOrganizer = false) => {
    TestBed.configureTestingModule({
      imports: [EventExpensesComponent],
      providers: [
        { provide: ExpenseService, useValue: expenseService },
        { provide: MatDialog, useValue: dialog },
        { provide: DeletedUsersService, useValue: deletedUsers }
      ]
    });
    fixture = TestBed.createComponent(EventExpensesComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('eventId', 'ev-1');
    fixture.componentRef.setInput('members', members);
    fixture.componentRef.setInput('meId', 'me');
    fixture.componentRef.setInput('isOrganizer', isOrganizer);
    fixture.detectChanges();
  };

  beforeEach(() => {
    expenseService = {
      list: vi.fn().mockReturnValue(of([expense()])),
      ledger: vi.fn().mockReturnValue(of(ledger)),
      settle: vi.fn().mockReturnValue(of(expense({ kind: 'SETTLEMENT' }))),
      delete: vi.fn().mockReturnValue(of(undefined)),
      removeReceipt: vi.fn().mockReturnValue(of(undefined))
    };
    dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of('saved') }) };
    // « zoe » deleted her account after paying; « gone » just left the event.
    deletedUsers = deletedUsersStub(['zoe']);
  });

  it('load_shouldShowTheTotalAndWhereTheViewerStands', () => {
    create();

    const text = (fixture.nativeElement.textContent as string).replace(/\s/g, ' ');
    expect(text).toContain('30,00 € au total');
    expect(component.balanceLabel().replace(/\s/g, ' ')).toBe('Tu dois 10,00 €');
  });

  it('balanceLabel_shouldSayWhatTheViewerIsOwed_orThatTheyAreEven', () => {
    expenseService.ledger.mockReturnValue(of({ ...ledger, balances: [{ userId: 'me', netCents: 2340 }] }));
    create();
    expect(component.balanceLabel().replace(/\s/g, ' ')).toBe('On te doit 23,40 €');

    component.ledger.set({ ...ledger, balances: [] });
    expect(component.balanceLabel()).toBe('Tu es à jour');
  });

  it('transfers_shouldPutTheViewersOwnPaymentFirst', () => {
    create();

    expect(component.transfers()[0]).toEqual({ fromUserId: 'me', toUserId: 'lea', amountCents: 1000 });
    expect(component.transferLabel(component.transfers()[0])).toBe('Toi → lea');
    expect(component.canSettle(component.transfers()[1])).toBe(false);
  });

  it('settle_shouldRecordTheRepayment_thenReload', () => {
    create();

    component.settle({ fromUserId: 'me', toUserId: 'lea', amountCents: 1000 });

    expect(expenseService.settle).toHaveBeenCalledWith('ev-1', 'me', 'lea', 1000);
    expect(expenseService.list).toHaveBeenCalledTimes(2);
    expect(component.settling().size).toBe(0);
  });

  it('canEdit_shouldBeTheAuthorOrTheOrganizer_andNeverASettlement', () => {
    create();
    expect(component.canEdit(expense({ createdBy: 'me' }))).toBe(true);
    expect(component.canEdit(expense({ createdBy: 'lea' }))).toBe(false);
    expect(component.canEdit(expense({ createdBy: 'me', kind: 'SETTLEMENT' }))).toBe(false);
    expect(component.canUndo(expense({ createdBy: 'me', kind: 'SETTLEMENT' }))).toBe(true);

    fixture.componentRef.setInput('isOrganizer', true);
    expect(component.canEdit(expense({ createdBy: 'lea' }))).toBe(true);
  });

  it('edit_shouldNotOpenSomeoneElsesExpense', () => {
    create();

    component.edit(expense({ createdBy: 'lea' }));

    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('add_shouldOpenTheDialog_andReloadOnceSaved', () => {
    create();

    component.add();

    expect(dialog.open.mock.calls[0][1].data).toEqual({ eventId: 'ev-1', members, meId: 'me' });
    expect(expenseService.list).toHaveBeenCalledTimes(2);
  });

  it('undo_shouldDeleteTheRepayment_thenReload', () => {
    create();

    component.undo(expense({ id: 's1', kind: 'SETTLEMENT', createdBy: 'me' }));

    expect(expenseService.delete).toHaveBeenCalledWith('ev-1', 's1');
    expect(expenseService.list).toHaveBeenCalledTimes(2);
  });

  it('name_shouldNameSomeoneWhoLeft_asAFormerMember', () => {
    create();

    expect(component.name('gone')).toBe('Ancien participant');
  });

  it('name_shouldBeTheDeletedLabel_forAConfirmedDeletedFormerMember', () => {
    create();

    expect(component.name('zoe')).toBe('Utilisateur supprimé');
    expect(component.transferLabel({ fromUserId: 'zoe', toUserId: 'me', amountCents: 500 })).toBe('Utilisateur supprimé → toi');
  });

  it('name_shouldStayAncienParticipant_forSomeoneWhoLeft', () => {
    create();

    expect(component.name('gone')).toBe('Ancien participant');
    expect(deletedUsers.isDeleted).not.toHaveBeenCalledWith('lea');
  });

  it('member_shouldGiveADeletedUserNoInitials', () => {
    create();

    expect(component.member('zoe')).toEqual({ id: 'zoe', name: 'Utilisateur supprimé', initials: '', deleted: true });
    expect(component.member('gone')).toMatchObject({ name: 'Ancien participant', initials: 'AP', deleted: false });
    expect(component.member('lea')).toBe(members[1]);
  });

  it('template_shouldShowANeutralAvatar_forADeletedPayer', () => {
    expenseService.list.mockReturnValue(of([expense({ paidBy: 'zoe' })]));
    create();

    const avatar = fixture.nativeElement.querySelector('.avatar') as HTMLElement;
    expect(avatar.querySelector('mat-icon')?.textContent).toBe('person');
    expect(avatar.style.background).toBe('rgb(138, 138, 147)');
  });

  it('visibleExpenses_shouldShowAFewUntilAskedForAll', () => {
    expenseService.list.mockReturnValue(of(Array.from({ length: EXPENSES_PREVIEW_SIZE + 2 }, (_, i) => expense({ id: `x${i}` }))));
    create();

    expect(component.visibleExpenses()).toHaveLength(EXPENSES_PREVIEW_SIZE);
    component.showAll.set(true);
    expect(component.visibleExpenses()).toHaveLength(EXPENSES_PREVIEW_SIZE + 2);
  });

  it('load_shouldSayTheAccountsAreUnavailable_whenTheyCannotBeRead', () => {
    expenseService.ledger.mockReturnValue(throwError(() => new Error('down')));
    create();

    expect(component.state()).toBe('unavailable');
    expect(fixture.nativeElement.textContent).toContain('Les comptes ne sont pas disponibles');
  });

  it('template_shouldInviteTheFirstExpense_whenThereIsNone', () => {
    expenseService.list.mockReturnValue(of([]));
    create();

    expect(fixture.nativeElement.textContent).toContain('Aucune dépense pour l’instant');
  });

  describe('receipt', () => {
    const withReceipt = (overrides: Partial<Expense> = {}) => expense({ receiptUrl: 'https://media/r.jpg', ...overrides });

    it('template_shouldOfferTheReceipt_onlyForAnExpenseThatHasOne', () => {
      expenseService.list.mockReturnValue(of([withReceipt({ id: 'x1' }), expense({ id: 'x2' })]));
      create();

      const buttons = fixture.nativeElement.querySelectorAll('.receipt-button') as NodeListOf<HTMLButtonElement>;
      expect(buttons).toHaveLength(1);
      buttons[0].click();
      expect(dialog.open).toHaveBeenCalledWith(PhotoViewerComponent, expect.anything());
    });

    it('openReceipt_shouldShowTheReceipt_removableByItsAuthor', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of('removed') });
      create();

      component.openReceipt(withReceipt({ createdBy: 'me' }));

      const data = dialog.open.mock.calls[0][1].data as PhotoViewerData;
      expect(data).toMatchObject({ url: 'https://media/r.jpg', title: 'Courses', canRemove: true, removeLabel: 'Retirer le ticket' });
      expect(data.subtitle).toContain('lea');
      data.remove?.().subscribe();
      expect(expenseService.removeReceipt).toHaveBeenCalledWith('ev-1', 'x1');
      expect(expenseService.list).toHaveBeenCalledTimes(2);
    });

    it('openReceipt_shouldNotLetSomeoneElseRemoveIt', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(undefined) });
      create();

      component.openReceipt(withReceipt({ createdBy: 'lea' }));

      expect((dialog.open.mock.calls[0][1].data as PhotoViewerData).canRemove).toBe(false);
      expect(expenseService.list).toHaveBeenCalledTimes(1);
    });

    it('openReceipt_shouldDoNothing_withoutAReceipt', () => {
      create();

      component.openReceipt(expense());

      expect(dialog.open).not.toHaveBeenCalled();
    });
  });
});
