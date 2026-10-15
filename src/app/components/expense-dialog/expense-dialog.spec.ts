import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { ExpenseDialogComponent, ExpenseDialogData, RECEIPT_MAX_SIDE, previewOwed } from './expense-dialog';
import { PhotoResizer } from '../../core/ui/photo-resize';
import { ExpenseService } from '../../services/expense.service';
import { Expense } from '../../models/expense.model';

describe('previewOwed', () => {
  it('previewOwed_shouldGiveTheExtraCentsInIdOrder_whenEqual', () => {
    const owed = previewOwed(1000, 'EQUAL', [{ userId: 'carol', value: 0 }, { userId: 'alice', value: 0 }, { userId: 'bob', value: 0 }]);

    expect(Object.fromEntries(owed)).toEqual({ carol: 333, alice: 334, bob: 333 });
  });

  it('previewOwed_shouldWeighShares_andAddUp', () => {
    const owed = previewOwed(100, 'SHARES', [{ userId: 'b', value: 1 }, { userId: 'a', value: 1 }, { userId: 'c', value: 1 }]);

    expect(Object.fromEntries(owed)).toEqual({ a: 34, b: 33, c: 33 });
  });

  it('previewOwed_shouldUseTheTypedAmounts_whenExact', () => {
    const owed = previewOwed(1250, 'EXACT', [{ userId: 'a', value: 1000 }, { userId: 'b', value: 250 }]);

    expect(Object.fromEntries(owed)).toEqual({ a: 1000, b: 250 });
  });

  it('previewOwed_shouldBeEmpty_withoutAnAmountOrPeople', () => {
    expect(previewOwed(0, 'EQUAL', [{ userId: 'a', value: 0 }]).size).toBe(0);
    expect(previewOwed(100, 'EQUAL', []).size).toBe(0);
  });
});

describe('ExpenseDialogComponent', () => {
  let fixture: ComponentFixture<ExpenseDialogComponent>;
  let component: ExpenseDialogComponent;
  let expenseService: Record<'add' | 'update' | 'delete' | 'attachReceipt' | 'removeReceipt', ReturnType<typeof vi.fn>>;
  let dialogRef: { close: ReturnType<typeof vi.fn> };
  let resizer: { downscale: ReturnType<typeof vi.fn> };
  const scaled = new Blob(['jpeg'], { type: 'image/jpeg' });

  const members = [
    { id: 'me', name: 'Toi', initials: 'TO' },
    { id: 'lea', name: 'lea', initials: 'LE' },
    { id: 'bob', name: 'bob', initials: 'BO' }
  ];
  const stored: Expense = {
    id: 'x1', title: 'Courses', amountCents: 1250, currency: 'EUR', paidBy: 'lea', createdBy: 'me', kind: 'EXPENSE',
    split: 'EXACT', shares: [{ userId: 'me', value: 1000 }, { userId: 'lea', value: 250 }],
    owedCents: { me: 1000, lea: 250 }, spentAt: new Date(), version: 4, receiptUrl: null
  };

  const create = (data: Partial<ExpenseDialogData> = {}) => {
    TestBed.configureTestingModule({
      imports: [ExpenseDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: ExpenseService, useValue: expenseService },
        { provide: MatDialogRef, useValue: dialogRef },
        // The canvas work is the browser's: here a receipt is "scaled down" at once.
        { provide: PhotoResizer, useValue: resizer },
        { provide: MAT_DIALOG_DATA, useValue: { eventId: 'ev-1', members, meId: 'me', ...data } }
      ]
    });
    fixture = TestBed.createComponent(ExpenseDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(() => {
    expenseService = {
      add: vi.fn().mockReturnValue(of(stored)),
      update: vi.fn().mockReturnValue(of(stored)),
      delete: vi.fn().mockReturnValue(of(undefined)),
      attachReceipt: vi.fn().mockReturnValue(of({ ...stored, version: 5, receiptUrl: 'https://media/r.jpg' })),
      removeReceipt: vi.fn().mockReturnValue(of(undefined))
    };
    dialogRef = { close: vi.fn() };
    resizer = { downscale: vi.fn().mockResolvedValue(scaled) };
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:receipt'), revokeObjectURL: vi.fn() }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('save_shouldAddAnEqualExpenseForEveryone_paidByTheViewer', () => {
    create();
    component.title.set('Courses');
    component.amountText.set('30');

    component.save();

    expect(expenseService.add).toHaveBeenCalledWith('ev-1', {
      title: 'Courses', amountCents: 3000, paidBy: 'me', split: 'EQUAL',
      shares: [{ userId: 'me', value: 0 }, { userId: 'lea', value: 0 }, { userId: 'bob', value: 0 }], version: null
    });
    expect(dialogRef.close).toHaveBeenCalledWith('saved');
  });

  it('save_shouldSendOnlyThePeopleTicked_withTheirWeights', () => {
    create();
    component.title.set('Location');
    component.amountText.set('90');
    component.split.set('SHARES');
    component.toggle('bob');
    component.setWeight('me', '2');

    component.save();

    expect(expenseService.add.mock.calls[0][1].shares).toEqual([{ userId: 'me', value: 2 }, { userId: 'lea', value: 1 }]);
  });

  it('invalidReason_shouldHoldTheSave_untilExactAmountsAddUp', () => {
    create();
    component.title.set('Resto');
    component.amountText.set('20');
    component.split.set('EXACT');
    component.toggle('bob');
    component.setExact('me', '12');
    component.setExact('lea', '5');

    expect(component.remainingLabel().replace(/\s/g, ' ')).toBe('Reste 3,00 € à répartir');
    component.save();
    expect(expenseService.add).not.toHaveBeenCalled();

    component.setExact('lea', '8');
    expect(component.invalidReason()).toBeNull();
  });

  it('invalidReason_shouldAskForATitleAndAnAmount', () => {
    create();

    expect(component.invalidReason()).toBe('Donne un titre à la dépense.');
    component.title.set('Essence');
    expect(component.invalidReason()).toBe('Indique un montant, par exemple 12,50.');
    component.amountText.set('abc');
    expect(component.invalidReason()).toBe('Indique un montant, par exemple 12,50.');
  });

  it('constructor_shouldStartFromTheExpense_whenEditing', () => {
    create({ expense: stored, canDelete: true });

    expect(component.title()).toBe('Courses');
    expect(component.amountText()).toBe('12,50');
    expect(component.paidBy()).toBe('lea');
    expect([...component.included()]).toEqual(['me', 'lea']);
    expect(component.exactTexts()['me']).toBe('10,00');
  });

  it('save_shouldUpdateWithTheVersionRead_whenEditing', () => {
    create({ expense: stored, canDelete: true });

    component.save();

    expect(expenseService.update).toHaveBeenCalledWith('ev-1', 'x1', expect.objectContaining({ version: 4, amountCents: 1250 }));
  });

  it('save_shouldExplainAConflict_andStayOpen', () => {
    expenseService.update.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'EVT-BUS-010' } })));
    create({ expense: stored, canDelete: true });

    component.save();

    expect(component.errorMessage()).toContain('Quelqu’un vient de modifier cette dépense');
    expect(component.saving()).toBe(false);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('remove_shouldDeleteTheExpense', () => {
    create({ expense: stored, canDelete: true });

    component.remove();

    expect(expenseService.delete).toHaveBeenCalledWith('ev-1', 'x1');
    expect(dialogRef.close).toHaveBeenCalledWith('deleted');
  });

  it('template_shouldOfferDeleteOnlyWhenAllowed', () => {
    create({ expense: stored, canDelete: false });

    expect(fixture.nativeElement.querySelector('.delete-button')).toBeNull();
  });

  describe('deleted members', () => {
    // A past event keeps the id of someone who deleted their account since.
    const zoe = { id: 'zoe', name: 'Utilisateur supprimé', initials: '', deleted: true };
    const rowNames = () => Array.from(fixture.nativeElement.querySelectorAll('.people .name') as NodeListOf<HTMLElement>)
      .map(name => name.textContent?.trim());

    it('save_shouldLeaveADeletedMemberOutOfANewExpense', () => {
      create({ members: [...members, zoe] });
      component.title.set('Courses');
      component.amountText.set('30');

      component.save();

      expect(component.payers.map(member => member.id)).toEqual(['me', 'lea', 'bob']);
      expect(rowNames()).toEqual(['Toi', 'lea', 'bob']);
      expect(expenseService.add.mock.calls[0][1].shares.map((share: { userId: string }) => share.userId))
        .toEqual(['me', 'lea', 'bob']);
    });

    it('members_shouldKeepADeletedMember_whomTheEditedExpenseIsFor', () => {
      create({ members: [...members, zoe], expense: { ...stored, paidBy: 'me', shares: [...stored.shares, { userId: 'zoe', value: 0 }] } });

      expect(component.members.map(member => member.id)).toEqual(['me', 'lea', 'bob', 'zoe']);
      expect(component.payers.map(member => member.id)).toEqual(['me', 'lea', 'bob']);
      expect(component.included().has('zoe')).toBe(true);
      const row = (fixture.nativeElement.querySelectorAll('.people li') as NodeListOf<HTMLElement>)[3];
      expect(row.querySelector('.avatar mat-icon')?.textContent).toBe('person');
    });

    it('payers_shouldKeepADeletedMember_whoPaidTheEditedExpense', () => {
      create({ members: [...members, zoe], expense: { ...stored, paidBy: 'zoe' } });

      expect(component.payers.map(member => member.id)).toEqual(['me', 'lea', 'bob', 'zoe']);
      expect(component.members.map(member => member.id)).toEqual(['me', 'lea', 'bob']);
      expect(component.paidBy()).toBe('zoe');
    });
  });

  describe('receipt', () => {
    const pick = (file: File) => ({ target: { files: [file], value: 'C:/ticket.jpg' } }) as unknown as Event;
    const withReceipt: Expense = { ...stored, receiptUrl: 'https://media/r.jpg' };
    const fillIn = () => {
      component.title.set('Courses');
      component.amountText.set('30');
    };

    it('onReceiptPicked_shouldScaleItDownTo2000_andPreviewIt', async () => {
      create();
      const file = new File(['raw'], 'ticket.jpg', { type: 'image/jpeg' });

      await component.onReceiptPicked(pick(file));
      fixture.detectChanges();

      expect(resizer.downscale).toHaveBeenCalledWith(file, RECEIPT_MAX_SIDE);
      expect(component.receiptBlob()).toBe(scaled);
      expect(fixture.nativeElement.querySelector('.receipt-thumb')?.getAttribute('src')).toBe('blob:receipt');
      expect(fixture.nativeElement.querySelector('.receipt-remove')?.textContent).toContain('Retirer le ticket');
    });

    it('onReceiptPicked_shouldRefuseAnUnreadableFile', async () => {
      resizer.downscale.mockRejectedValue(new Error('HEIC'));
      create();

      await component.onReceiptPicked(pick(new File(['raw'], 'ticket.heic')));

      expect(component.receiptBlob()).toBeNull();
      expect(component.errorMessage()).toContain('ne peut pas être lue');
      expect(component.preparingReceipt()).toBe(false);
    });

    it('save_shouldAddTheExpense_thenAttachTheReceipt', async () => {
      create();
      fillIn();
      await component.onReceiptPicked(pick(new File(['raw'], 'ticket.jpg')));

      component.save();

      expect(expenseService.add).toHaveBeenCalled();
      expect(expenseService.attachReceipt).toHaveBeenCalledWith('ev-1', 'x1', scaled);
      expect(dialogRef.close).toHaveBeenCalledWith('saved');
    });

    it('save_shouldNotTouchTheReceipt_whenNoneWasPicked', () => {
      create();
      fillIn();

      component.save();

      expect(expenseService.attachReceipt).not.toHaveBeenCalled();
      expect(expenseService.removeReceipt).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith('saved');
    });

    it('save_shouldKeepTheExpense_whenTheReceiptFails_andRetryOnlyTheReceipt', async () => {
      expenseService.attachReceipt.mockReturnValueOnce(throwError(() =>
        new HttpErrorResponse({ status: 413, error: { code: 'EVT-BUS-012' } })));
      create();
      fillIn();
      await component.onReceiptPicked(pick(new File(['raw'], 'ticket.jpg')));

      component.save();
      fixture.detectChanges();

      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(component.errorMessage()).toContain('La dépense est enregistrée, mais pas le ticket');
      expect(component.errorMessage()).toContain('trop lourde');
      expect(component.receiptBlob()).toBe(scaled);
      expect(fixture.nativeElement.querySelector('.save-button').textContent).toContain('Réessayer le ticket');

      component.save();

      expect(expenseService.add).toHaveBeenCalledTimes(1);
      expect(expenseService.attachReceipt).toHaveBeenCalledTimes(2);
      expect(dialogRef.close).toHaveBeenCalledWith('saved');
    });

    it('close_shouldStillReportSaved_onceTheExpenseIsStored', async () => {
      expenseService.attachReceipt.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 502 })));
      create();
      fillIn();
      await component.onReceiptPicked(pick(new File(['raw'], 'ticket.jpg')));
      component.save();

      component.close();

      expect(dialogRef.close).toHaveBeenCalledWith('saved');
    });

    it('template_shouldShowTheStoredReceipt_andOfferToRemoveIt_whenAllowed', () => {
      create({ expense: withReceipt, canDelete: true });

      expect(fixture.nativeElement.querySelector('.receipt-thumb')?.getAttribute('src')).toBe('https://media/r.jpg');
      expect(fixture.nativeElement.querySelector('.receipt-remove')).not.toBeNull();
    });

    it('template_shouldHideTheReceipt_whenTheViewerMayNotEdit', () => {
      create({ expense: withReceipt, canDelete: false });

      expect(fixture.nativeElement.querySelector('.receipt')).toBeNull();
    });

    it('template_shouldOfferToAttachAReceipt_toANewExpense', () => {
      create();

      expect(fixture.nativeElement.querySelector('.receipt-attach')?.textContent).toContain('Joindre le ticket');
    });

    it('clearReceipt_shouldRemoveTheStoredReceiptOnSave', () => {
      create({ expense: withReceipt, canDelete: true });

      component.clearReceipt();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.receipt-attach')).not.toBeNull();
      component.save();

      expect(expenseService.update).toHaveBeenCalled();
      expect(expenseService.removeReceipt).toHaveBeenCalledWith('ev-1', 'x1');
      expect(dialogRef.close).toHaveBeenCalledWith('saved');
    });

    it('clearReceipt_shouldDropAPickedReceipt_beforeTheStoredOne', async () => {
      create({ expense: withReceipt, canDelete: true });
      await component.onReceiptPicked(pick(new File(['raw'], 'ticket.jpg')));

      component.clearReceipt();

      expect(component.receiptBlob()).toBeNull();
      expect(component.receiptRemoved()).toBe(false);
      expect(component.receiptShown()).toBe('https://media/r.jpg');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:receipt');
    });
  });
});
