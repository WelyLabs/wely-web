import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityInviteDialogComponent } from './community-invite-dialog';
import { CommunityService } from '../../../services/community.service';
import { SocialService } from '../../../services/social.service';
import { ChatService } from '../../../services/chat.service';
import { Community } from '../../../models/community.model';

const community = { communityId: 'c1', name: 'Les copains' } as Community;
const friend = (userName: string) => ({ userId: userName, userName, hashtag: 1 });

describe('CommunityInviteDialogComponent', () => {
  let communities: { invite: ReturnType<typeof vi.fn> };
  let social: { listFriends: ReturnType<typeof vi.fn> };
  let chat: { getConversation: ReturnType<typeof vi.fn>; sendMessage: ReturnType<typeof vi.fn> };
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  function open() {
    TestBed.configureTestingModule({
      imports: [CommunityInviteDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: CommunityService, useValue: communities },
        { provide: SocialService, useValue: social },
        { provide: ChatService, useValue: chat },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { community, memberIds: ['hugo'] } },
      ],
    });
    const fixture = TestBed.createComponent(CommunityInviteDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    communities = { invite: vi.fn().mockReturnValue(of({ token: 'TOKEN_abcdefghijklmnop' })) };
    social = { listFriends: vi.fn().mockReturnValue(of([friend('zoe'), friend('hugo'), friend('lea')])) };
    chat = {
      getConversation: vi.fn().mockReturnValue(of({ id: 'conv1' })),
      sendMessage: vi.fn().mockReturnValue(of({ pending: true }, { pending: false })),
    };
    dialogRef = { close: vi.fn() };
  });

  it('lists the friends who are not members yet, by name', () => {
    const dialog = open().componentInstance;

    expect(dialog.loading()).toBe(false);
    expect(dialog.shown().map((f) => f.userId)).toEqual(['lea', 'zoe']);

    dialog.query.set('ZO');
    expect(dialog.shown().map((f) => f.userId)).toEqual(['zoe']);
  });

  it('creates the invitation, then sends its link by message', () => {
    const dialog = open().componentInstance;

    dialog.invite(friend('lea'));

    expect(communities.invite).toHaveBeenCalledWith('c1', 'lea');
    expect(chat.getConversation).toHaveBeenCalledWith('lea');
    const [conversationId, text, receiverId] = chat.sendMessage.mock.calls[0];
    expect(conversationId).toBe('conv1');
    expect(receiverId).toBe('lea');
    expect(text).toContain('« Les copains »');
    expect(text).toContain('/communities/invite/TOKEN_abcdefghijklmnop');
    expect(dialog.stateOf('lea')).toBe('sent');
    expect(dialog.sentCount()).toBe(1);
  });

  it('marks a message the chat could not deliver as failed', () => {
    chat.sendMessage.mockReturnValue(of({ pending: true }, { pending: false, failed: true }));
    const dialog = open().componentInstance;

    dialog.invite(friend('lea'));

    expect(dialog.stateOf('lea')).toBe('failed');
  });

  it('words a refused invitation', () => {
    communities.invite.mockReturnValue(throwError(() => ({ error: { code: 'SCL-BUS-015' } })));
    const dialog = open().componentInstance;

    dialog.invite(friend('lea'));

    expect(dialog.stateOf('lea')).toBe('failed');
    expect(dialog.errors()['lea']).toContain('amis');
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  it('falls back to a generic message', () => {
    communities.invite.mockReturnValue(throwError(() => ({})));
    const dialog = open().componentInstance;

    dialog.invite(friend('lea'));

    expect(dialog.errors()['lea']).toContain("n'a pas pu");
  });

  it('stops loading when the friends cannot be read', () => {
    social.listFriends.mockReturnValue(throwError(() => new Error('down')));

    expect(open().componentInstance.loading()).toBe(false);
  });

  it('gives each friend a stable colour and initials', () => {
    const dialog = open().componentInstance;

    expect(dialog.color('lea')).toBe(dialog.color('lea'));
    expect(dialog.initials('lea')).toBe('LE');
  });

  it('closes with how many were sent', () => {
    const dialog = open().componentInstance;
    dialog.invite(friend('lea'));

    dialog.close();

    expect(dialogRef.close).toHaveBeenCalledWith(1);
  });
});
