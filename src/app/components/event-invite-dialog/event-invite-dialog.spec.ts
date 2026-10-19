import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventInviteDialogComponent, EventInviteDialogData, whenOf } from './event-invite-dialog';
import { EventService, FeedEvent } from '../../services/event.service';
import { SocialService } from '../../services/social.service';
import { ChatService } from '../../services/chat.service';

// Reaches ChatService through the invite dialog: rsocket-js is replaced by the shared stub.
vi.mock('rsocket-core', () => import('../../../testing/rsocket-core.stub'));
vi.mock('rsocket-websocket-client', () => import('../../../testing/rsocket-websocket-client.stub'));

const dinner = (overrides: Partial<FeedEvent> = {}): FeedEvent => ({
  id: 'e1', title: 'Dîner', organizerId: 'me',
  startDate: new Date('2026-10-25T20:00:00'), endDate: new Date('2026-10-25T23:00:00'),
  location: 'Chez moi', image: null, description: '', visibility: 'PRIVATE', ...overrides,
});
const friend = (userName: string) => ({ userId: userName, userName, hashtag: 1 });

describe('EventInviteDialogComponent', () => {
  let events: { inviteFriend: ReturnType<typeof vi.fn>; withdrawInvitation: ReturnType<typeof vi.fn> };
  let social: { listFriends: ReturnType<typeof vi.fn> };
  let chat: { getConversation: ReturnType<typeof vi.fn>; sendMessage: ReturnType<typeof vi.fn> };
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  function open(data: Partial<EventInviteDialogData> = {}) {
    TestBed.configureTestingModule({
      imports: [EventInviteDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: EventService, useValue: events },
        { provide: SocialService, useValue: social },
        { provide: ChatService, useValue: chat },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { event: dinner(), participantIds: ['me', 'hugo'], invitedIds: ['zoe'], ...data } },
      ],
    });
    const fixture = TestBed.createComponent(EventInviteDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    events = {
      inviteFriend: vi.fn().mockReturnValue(of({ count: 1, participantIds: ['me'], friendsGoingIds: [], invitedIds: ['lea'] })),
      withdrawInvitation: vi.fn().mockReturnValue(of(undefined)),
    };
    social = { listFriends: vi.fn().mockReturnValue(of([friend('zoe'), friend('hugo'), friend('lea')])) };
    chat = {
      getConversation: vi.fn().mockReturnValue(of({ id: 'conv1' })),
      sendMessage: vi.fn().mockReturnValue(of({ pending: true }, { pending: false })),
    };
    dialogRef = { close: vi.fn() };
  });

  it('shouldListTheFriendsNotTakingPart_byName_withThoseAlreadyInvited', () => {
    const fixture = open();
    const dialog = fixture.componentInstance;

    expect(dialog.loading()).toBe(false);
    expect(dialog.shown().map((f) => f.userId)).toEqual(['lea', 'zoe']);
    expect(dialog.stateOf('zoe')).toBe('invited');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('même privé');

    dialog.query.set('LE');
    expect(dialog.shown().map((f) => f.userId)).toEqual(['lea']);
  });

  it('shouldStopLoading_whenTheFriendsCannotBeRead', () => {
    social.listFriends.mockReturnValue(throwError(() => new Error('down')));

    const dialog = open().componentInstance;

    expect(dialog.loading()).toBe(false);
    expect(dialog.shown()).toEqual([]);
  });

  it('invite_shouldStoreTheInvitation_thenMessageTheFriendTheLink', () => {
    const dialog = open().componentInstance;

    dialog.invite(friend('lea'));

    expect(events.inviteFriend).toHaveBeenCalledWith('e1', 'lea');
    expect(chat.getConversation).toHaveBeenCalledWith('lea');
    const [conversationId, text, receiverId] = chat.sendMessage.mock.calls[0];
    expect(conversationId).toBe('conv1');
    expect(receiverId).toBe('lea');
    expect(text).toContain("Je t'invite à « Dîner » le dimanche 25 octobre à 20:00 sur Wely");
    expect(text).toMatch(/\/event\/e1\?invitation$/);
    expect(dialog.stateOf('lea')).toBe('invited');
  });

  it('invite_shouldKeepTheInvitation_butSaySo_whenOnlyTheMessageFailed', () => {
    chat.sendMessage.mockReturnValue(of({ failed: true }));
    const dialog = open().componentInstance;

    dialog.invite(friend('lea'));

    expect(dialog.stateOf('lea')).toBe('invited');
    expect(dialog.errors()['lea']).toContain("le message n'est pas parti");
  });

  it('invite_shouldExplainARefusal_andOfferToRetry', () => {
    events.inviteFriend.mockReturnValue(throwError(() =>
      new HttpErrorResponse({ status: 404, error: { code: 'EVT-BUS-036' } })));
    const fixture = open();
    const dialog = fixture.componentInstance;

    dialog.invite(friend('lea'));
    fixture.detectChanges();

    expect(dialog.stateOf('lea')).toBe('failed');
    expect(dialog.errors()['lea']).toContain('amis');
    expect(chat.sendMessage).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).querySelector('.invite')?.textContent).toContain('Réessayer');
  });

  it('withdraw_shouldTakeTheInvitationBack', () => {
    const fixture = open();
    const dialog = fixture.componentInstance;

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.withdraw')?.click();

    expect(events.withdrawInvitation).toHaveBeenCalledWith('e1', 'zoe');
    expect(dialog.stateOf('zoe')).toBeUndefined();
    expect(dialog.invitedIds()).toEqual([]);
  });

  it('withdraw_shouldKeepTheInvitation_andExplain_whenItFails', () => {
    events.withdrawInvitation.mockReturnValue(throwError(() => new Error('down')));
    const dialog = open().componentInstance;

    dialog.withdraw(friend('zoe'));

    expect(dialog.stateOf('zoe')).toBe('invited');
    expect(dialog.errors()['zoe']).toBe("L'invitation n'a pas pu être envoyée.");
  });

  it('close_shouldAnswerWithWhoIsInvitedNow', () => {
    const dialog = open().componentInstance;
    dialog.invite(friend('lea'));

    dialog.close();

    expect(dialogRef.close).toHaveBeenCalledWith(['zoe', 'lea']);
  });

  it('whenOf_shouldSayTheDay_theTime_orNothingWhileVoted', () => {
    expect(whenOf(dinner())).toBe(' le dimanche 25 octobre à 20:00');
    expect(whenOf(dinner({ allDay: true, startDate: new Date(Date.UTC(2026, 9, 24)) }))).toBe(' le samedi 24 octobre');
    expect(whenOf(dinner({ poll: { status: 'OPEN', fixedSlotId: null, slots: [] } }))).toBe('');
  });
});
