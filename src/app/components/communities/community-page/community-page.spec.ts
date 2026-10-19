import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityPageComponent } from './community-page';
import { CommunityService } from '../../../services/community.service';
import { EventService, FeedEvent } from '../../../services/event.service';
import { UserService } from '../../../services/user.service';
import { NotificationService } from '../../../services/notification.service';
import { Community, CommunityInvitation, CommunityMember } from '../../../models/community.model';
import { DeletedUsersService } from '../../../services/deleted-users.service';
import { deletedUsersStub } from '../../../../testing/deleted-users.stub';

// Reaches ChatService through the invite dialog: rsocket-js is replaced by the shared stub, so this file never
// loads the real module first for the specs that share its chunk.
vi.mock('rsocket-core', () => import('../../../../testing/rsocket-core.stub'));
vi.mock('rsocket-websocket-client', () => import('../../../../testing/rsocket-websocket-client.stub'));

const community = (overrides: Partial<Community> = {}): Community => ({
  communityId: 'c1', name: 'Club Auto', description: 'Voitures', interests: ['auto'], visibility: 'PUBLIC',
  createdAt: '2026-10-01T10:00:00Z', memberCount: 3, role: 'MEMBER',
  friendMembers: [{ userId: 'lea', userName: 'lea', hashtag: 1 }], friendMemberCount: 1, pictureUrl: null, ...overrides,
});
const member = (userId: string, role: CommunityMember['role'] = 'MEMBER'): CommunityMember => ({
  userId, userName: userId, hashtag: 1, profilePicUrl: null, role, joinedAt: '2026-10-02T10:00:00Z',
});
const event = (id: string, start: string, overrides: Partial<FeedEvent> = {}): FeedEvent => ({
  id, title: id, organizerId: 'hugo', startDate: new Date(start), endDate: new Date(start), location: 'Gerland',
  image: null, description: '', communityId: 'c1', responses: { yes: ['hugo'], maybe: ['lea'], no: [] }, ...overrides,
});
const invitation = { token: 'tok', inviteeId: 'zoe', inviteeName: 'zoe', expired: false } as CommunityInvitation;

describe('CommunityPageComponent', () => {
  let communities: Record<string, ReturnType<typeof vi.fn>>;
  let events: Record<string, ReturnType<typeof vi.fn>>;
  let notifications: { showInfo: ReturnType<typeof vi.fn> };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let deletedUsers: ReturnType<typeof deletedUsersStub>;
  let router: Router;
  let page: CommunityPageComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<CommunityPageComponent>>;

  /** Each dialog opened closes with the next value: true confirms, an object is a result. */
  function dialogsClose(...values: unknown[]): void {
    for (const value of values) {
      dialog.open.mockReturnValueOnce({ afterClosed: () => of(value) });
    }
  }

  function open(): void {
    TestBed.configureTestingModule({
      imports: [CommunityPageComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: CommunityService, useValue: communities },
        { provide: EventService, useValue: events },
        { provide: NotificationService, useValue: notifications },
        { provide: MatDialog, useValue: dialog },
        { provide: DeletedUsersService, useValue: deletedUsers },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'c1' })) } },
        {
          provide: UserService,
          useValue: { currentUser$: new BehaviorSubject({ id: 'me' }), getCurrentUserValue: () => ({ id: 'me' }) },
        },
      ],
    });
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(CommunityPageComponent);
    fixture.detectChanges();
    page = fixture.componentInstance;
  }

  beforeEach(() => {
    communities = {
      get: vi.fn().mockReturnValue(of(community())),
      members: vi.fn().mockReturnValue(of([member('hugo', 'ADMIN'), member('lea'), member('me')])),
      invitations: vi.fn().mockReturnValue(of([invitation])),
      join: vi.fn().mockReturnValue(of(community())),
      leave: vi.fn().mockReturnValue(of({ communityDeleted: false, newAdminId: null })),
      delete: vi.fn().mockReturnValue(of(undefined)),
      changeRole: vi.fn().mockReturnValue(of(undefined)),
      removeMember: vi.fn().mockReturnValue(of(undefined)),
      revoke: vi.fn().mockReturnValue(of(undefined)),
    };
    events = {
      getCommunityEvents: vi.fn().mockReturnValue(of([event('e1', '2099-01-01T10:00:00Z')])),
      respond: vi.fn(),
      deleteEvent: vi.fn().mockReturnValue(of(undefined)),
    };
    notifications = { showInfo: vi.fn() };
    dialog = { open: vi.fn() };
    // « gone » deleted their account; « ghost » simply left.
    deletedUsers = deletedUsersStub(['gone']);
  });

  describe('as a member', () => {
    beforeEach(() => open());

    it('loads the community, its members and its events', () => {
      expect(communities['get']).toHaveBeenCalledWith('c1');
      expect(page.isMember()).toBe(true);
      expect(page.isAdmin()).toBe(false);
      expect(page.members().length).toBe(3);
      expect(page.communityEvents().length).toBe(1);
      expect(page.initials()).toBe('CA');
      expect(page.color()).toBeTruthy();
    });

    it('names members, the viewer as "Vous", and anyone gone as a former member', () => {
      expect(page.nameOf('lea')).toBe('lea');
      expect(page.nameOf('me')).toBe('Vous');
      expect(page.nameOf('ghost')).toBe('Ancien membre');
    });

    it('nameOf_shouldBeTheDeletedLabel_forAConfirmedDeletedId', () => {
      expect(page.nameOf('gone')).toBe('Utilisateur supprimé');
    });

    it('nameOf_shouldStayAncienMembre_forSomeoneWhoLeft', () => {
      expect(page.nameOf('ghost')).toBe('Ancien membre');
      expect(deletedUsers.isDeleted).not.toHaveBeenCalledWith('lea');
    });

    it('reads the viewer\'s answer and the counts', () => {
      const e = event('e', '2099-01-01T10:00:00Z', { responses: { yes: ['hugo'], maybe: ['me'], no: ['x', 'y'] } });

      expect(page.myAnswer(e)).toBe('MAYBE');
      expect(page.countOf(e, 'YES')).toBe(1);
      expect(page.countOf(e, 'NO')).toBe(2);
      expect(page.idsOf(e, 'MAYBE')).toEqual(['me']);
      expect(page.myAnswer({ ...e, responses: { yes: ['me'], maybe: [], no: [] } })).toBe('YES');
      expect(page.myAnswer({ ...e, responses: { yes: [], maybe: [], no: ['me'] } })).toBe('NO');
      expect(page.myAnswer({ ...e, responses: { yes: [], maybe: [], no: [] } })).toBeNull();
      expect(page.myAnswer({ ...e, responses: null })).toBeNull();
      expect(page.idsOf({ ...e, responses: null }, 'YES')).toEqual([]);
    });

    it('records an answer and shows the event as it stands', () => {
      const answered = event('e1', '2099-01-01T10:00:00Z', { responses: { yes: ['hugo', 'me'], maybe: [], no: [] } });
      events['respond'].mockReturnValue(of(answered));

      page.respond(page.communityEvents()[0], 'YES');

      expect(events['respond']).toHaveBeenCalledWith('e1', 'YES');
      expect(page.myAnswer(page.communityEvents()[0])).toBe('YES');
    });

    it('does not resend the answer already given', () => {
      page.respond(event('e1', '2099-01-01T10:00:00Z', { responses: { yes: ['me'], maybe: [], no: [] } }), 'YES');

      expect(events['respond']).not.toHaveBeenCalled();
    });

    it('sends the organizer to the event page to step out', () => {
      page.respond(event('e1', '2099-01-01T10:00:00Z', { organizerId: 'me', responses: { yes: ['me'], maybe: [], no: [] } }), 'NO');

      expect(events['respond']).not.toHaveBeenCalled();
      expect(notifications.showInfo).toHaveBeenCalledWith(expect.stringContaining('passez la main'));
    });

    it('says when an answer could not be saved', () => {
      events['respond'].mockReturnValue(throwError(() => new Error('down')));

      page.respond(page.communityEvents()[0], 'NO');

      expect(notifications.showInfo).toHaveBeenCalledWith(expect.stringContaining("n'a pas pu"));
    });

    it('unfolds and folds the answers of one event', () => {
      const e = page.communityEvents()[0];
      page.toggleResponses(e);
      expect(page.expanded()).toBe('e1');
      page.toggleResponses(e);
      expect(page.expanded()).toBeNull();
    });

    it('lets the organizer delete their event, but not someone else\'s', () => {
      expect(page.canDelete(event('mine', '2099-01-01T10:00:00Z', { organizerId: 'me' }))).toBe(true);
      expect(page.canDelete(page.communityEvents()[0])).toBe(false);
    });

    it('deletes an event once confirmed', () => {
      dialogsClose(true);

      page.deleteEvent(page.communityEvents()[0]);

      expect(events['deleteEvent']).toHaveBeenCalledWith('e1');
      expect(page.communityEvents()).toEqual([]);
    });

    it('keeps the event when the deletion is cancelled or fails', () => {
      dialogsClose(false, true);
      page.deleteEvent(page.communityEvents()[0]);
      expect(events['deleteEvent']).not.toHaveBeenCalled();

      events['deleteEvent'].mockReturnValue(throwError(() => new Error('down')));
      page.deleteEvent(page.communityEvents()[0]);
      expect(page.communityEvents().length).toBe(1);
      expect(notifications.showInfo).toHaveBeenCalled();
    });

    it('adds a new event in date order', () => {
      dialogsClose(event('e0', '2098-01-01T10:00:00Z'));

      page.newEvent();

      expect(page.communityEvents().map((e) => e.id)).toEqual(['e0', 'e1']);
    });

    it('adds nothing when the new event is cancelled', () => {
      dialogsClose(undefined);
      page.newEvent();
      expect(page.communityEvents().length).toBe(1);
    });

    it('leaves once confirmed, and comes back to the public community from outside', () => {
      communities['get'].mockReturnValue(of(community({ role: null })));
      dialogsClose(true);

      page.leave();

      expect(communities['leave']).toHaveBeenCalledWith('c1');
      expect(page.community()?.role).toBeNull();
      expect(page.communityEvents()).toEqual([]);
    });

    it('goes back to the list after leaving, if the community cannot be read any more', () => {
      communities['get'].mockReturnValue(throwError(() => new Error('gone')));
      dialogsClose(true);

      page.leave();

      expect(router.navigate).toHaveBeenCalledWith(['/communities']);
    });

    it('asks again before deleting, when the only member leaves', () => {
      communities['leave']
        .mockReturnValueOnce(throwError(() => ({ error: { code: 'SCL-BUS-016' } })))
        .mockReturnValueOnce(of({ communityDeleted: true, newAdminId: null }));
      dialogsClose(true, true);

      page.leave();

      expect(communities['leave']).toHaveBeenLastCalledWith('c1', true);
    });

    it('words any other refusal when leaving', () => {
      communities['leave'].mockReturnValue(throwError(() => ({ error: { code: 'SCL-BUS-017' } })));
      dialogsClose(true);

      page.leave();

      expect(notifications.showInfo).toHaveBeenCalledWith(expect.stringContaining('administrateur'));
    });

    it('does not leave when cancelled', () => {
      dialogsClose(false);
      page.leave();
      expect(communities['leave']).not.toHaveBeenCalled();
    });

    it('does not load the invitations of a plain member', () => {
      page.select('invitations');
      expect(communities['invitations']).not.toHaveBeenCalled();
      expect(page.tab()).toBe('invitations');
    });

    it('gives each member a colour and initials', () => {
      expect(page.memberColor('lea')).toBe(page.memberColor('lea'));
      expect(page.memberInitials('lea')).toBe('LE');
    });
  });

  describe('as an admin', () => {
    beforeEach(() => {
      communities['get'].mockReturnValue(of(community({ role: 'ADMIN' })));
      open();
    });

    it('renders the events with their answers, unfolded', () => {
      page.toggleResponses(page.communityEvents()[0]);
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;

      expect(el.querySelector('h1')?.textContent).toContain('Club Auto');
      expect(el.textContent).toContain('Vous êtes administrateur');
      expect(el.querySelectorAll('.rsvp-btn').length).toBe(3);
      expect(el.querySelector('.responses')?.textContent).toContain('lea');
      expect(el.querySelector('.responses')?.textContent).toContain('Personne');
      expect(el.querySelector('.delete')).toBeTruthy();
    });

    it('renders the members, with an admin\'s actions', () => {
      page.select('members');
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;

      expect(el.querySelectorAll('.members li').length).toBe(3);
      expect(el.querySelector('.members .role-pill')?.textContent).toContain('Admin');
      expect(el.querySelectorAll('.members button[mat-icon-button]').length).toBe(3);
    });

    it('renders the pending and expired invitations', () => {
      communities['invitations'].mockReturnValue(of([invitation,
        { ...invitation, token: 'old', inviteeName: 'max', expired: true, expiresAt: '2026-10-10T10:00:00Z' }]));
      page.select('invitations');
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;

      expect(el.querySelectorAll('.members li').length).toBe(2);
      expect(el.querySelector('.expired')?.textContent).toContain('expirée');
    });

    it('renders an empty events tab and no invitations', () => {
      page.communityEvents.set([]);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Aucun événement prévu');

      communities['invitations'].mockReturnValue(of([]));
      page.select('invitations');
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Aucune invitation en attente');
    });

    it('loads the invitations on their tab, and revokes one', () => {
      page.select('invitations');
      expect(page.invitations()).toEqual([invitation]);

      page.revoke(invitation);

      expect(communities['revoke']).toHaveBeenCalledWith('c1', 'tok');
      expect(page.invitations()).toEqual([]);
    });

    it('may delete any event of the community', () => {
      expect(page.canDelete(page.communityEvents()[0])).toBe(true);
    });

    it('lets an admin change the picture from the badge', () => {
      const el: HTMLElement = fixture.nativeElement;
      const badge = el.querySelector('button.badge-avatar') as HTMLButtonElement;
      dialogsClose(community({ role: 'ADMIN', pictureUrl: 'https://media/new.jpg' }));

      badge.click();
      fixture.detectChanges();

      expect(dialog.open.mock.calls[0][1].data.communityId).toBe('c1');
      expect(page.community()?.pictureUrl).toBe('https://media/new.jpg');
      expect(el.querySelector('button.badge-avatar img')?.getAttribute('src')).toBe('https://media/new.jpg');
    });

    it('keeps the community as it was when the picture dialog is cancelled', () => {
      dialogsClose(undefined);

      page.changePicture();

      expect(page.community()?.pictureUrl).toBeNull();
    });

    it('edits the community', () => {
      dialogsClose(community({ role: 'ADMIN', name: 'Club Rétro' }));

      page.edit();

      expect(page.community()?.name).toBe('Club Rétro');
    });

    it('deletes the community once confirmed, then goes back to the list', () => {
      dialogsClose(true);

      page.remove();

      expect(communities['delete']).toHaveBeenCalledWith('c1');
      expect(router.navigate).toHaveBeenCalledWith(['/communities']);
    });

    it('reports a failed deletion', () => {
      communities['delete'].mockReturnValue(throwError(() => ({ error: {} })));
      dialogsClose(true);

      page.remove();

      expect(notifications.showInfo).toHaveBeenCalledWith(expect.stringContaining('réessayez'));
    });

    it('reloads the invitations after inviting', () => {
      dialogsClose(2);

      page.invite();

      expect(dialog.open.mock.calls[0][1].data.memberIds).toEqual(['hugo', 'lea', 'me']);
      expect(communities['invitations']).toHaveBeenCalled();
    });

    it('promotes a member, and reloads its own role when it changed its own', () => {
      page.setRole(member('lea'), 'ADMIN');
      expect(communities['changeRole']).toHaveBeenCalledWith('c1', 'lea', 'ADMIN');
      expect(communities['members']).toHaveBeenCalledTimes(2);

      page.setRole(member('me', 'ADMIN'), 'MEMBER');
      expect(communities['get']).toHaveBeenCalledTimes(2);
    });

    it('words a refused role change', () => {
      communities['changeRole'].mockReturnValue(throwError(() => ({ error: { code: 'SCL-BUS-017' } })));

      page.setRole(member('me', 'ADMIN'), 'MEMBER');

      expect(notifications.showInfo).toHaveBeenCalledWith(expect.stringContaining('au moins un administrateur'));
    });

    it('removes a member once confirmed', () => {
      dialogsClose(true);

      page.removeMember(member('lea'));

      expect(communities['removeMember']).toHaveBeenCalledWith('c1', 'lea');
      expect(page.members().map((m) => m.userId)).toEqual(['hugo', 'me']);
      expect(page.community()?.memberCount).toBe(2);
    });

    it('reports a failed removal and revocation', () => {
      communities['removeMember'].mockReturnValue(throwError(() => ({ error: {} })));
      communities['revoke'].mockReturnValue(throwError(() => ({ error: {} })));
      dialogsClose(true);

      page.removeMember(member('lea'));
      page.revoke(invitation);

      expect(notifications.showInfo).toHaveBeenCalledTimes(2);
    });
  });

  describe('picture', () => {
    it('shows a member the picture, not as a button', () => {
      communities['get'].mockReturnValue(of(community({ pictureUrl: 'https://media/c1.jpg' })));
      open();
      const el: HTMLElement = fixture.nativeElement;

      expect(el.querySelector('img.badge-avatar')?.getAttribute('src')).toBe('https://media/c1.jpg');
      expect(el.querySelector('button.badge-avatar')).toBeNull();
    });

    it('shows a member the initials without a picture', () => {
      open();
      const el: HTMLElement = fixture.nativeElement;

      expect(el.querySelector('span.badge-avatar')?.textContent).toContain('CA');
      expect(el.querySelector('button.badge-avatar')).toBeNull();
    });
  });

  describe('from outside', () => {
    it('joins a public community and loads what members see', () => {
      communities['get'].mockReturnValue(of(community({ role: null })));
      open();
      expect(communities['members']).not.toHaveBeenCalled();

      page.join();

      expect(page.isMember()).toBe(true);
      expect(communities['members']).toHaveBeenCalled();
      expect(notifications.showInfo).toHaveBeenCalledWith(expect.stringContaining('Bienvenue'));
    });

    it('words a refused join', () => {
      communities['get'].mockReturnValue(of(community({ role: null })));
      communities['join'].mockReturnValue(throwError(() => ({ error: { code: 'SCL-BUS-010' } })));
      open();

      page.join();

      expect(page.busy()).toBe(false);
      expect(notifications.showInfo).toHaveBeenCalledWith(expect.stringContaining("n'existe pas"));
    });

    it('goes back to the list after leaving a private community', () => {
      communities['get'].mockReturnValue(of(community({ visibility: 'PRIVATE' })));
      open();
      dialogsClose(true);

      page.leave();

      expect(router.navigate).toHaveBeenCalledWith(['/communities']);
    });

    it('renders a public community\'s purpose, and keeps the rest for members', () => {
      communities['get'].mockReturnValue(of(community({ role: null })));
      open();
      const el: HTMLElement = fixture.nativeElement;

      expect(el.textContent).toContain('Réservé aux membres');
      expect(el.querySelector('button.join')).toBeTruthy();
      expect(el.querySelector('.friends')?.textContent).toContain('1 ami membre');
      expect(el.querySelector('.tabs-segment')).toBeNull();
    });

    it('renders the not-found page', () => {
      communities['get'].mockReturnValue(throwError(() => ({ status: 404 })));
      open();

      expect(fixture.nativeElement.textContent).toContain('Communauté introuvable');
    });

    it('shows a community it cannot see as not found', () => {
      communities['get'].mockReturnValue(throwError(() => ({ status: 404 })));
      open();

      expect(page.notFound()).toBe(true);
      expect(page.loading()).toBe(false);
      expect(notifications.showInfo).not.toHaveBeenCalled();
    });

    it('also says when the community could not be loaded at all', () => {
      communities['get'].mockReturnValue(throwError(() => ({ status: 502 })));
      open();

      expect(notifications.showInfo).toHaveBeenCalledWith(expect.stringContaining('Impossible'));
    });

    it('shows no events or members when they cannot be read', () => {
      communities['members'].mockReturnValue(throwError(() => new Error('down')));
      events['getCommunityEvents'].mockReturnValue(throwError(() => new Error('down')));
      open();

      expect(page.members()).toEqual([]);
      expect(page.communityEvents()).toEqual([]);
    });

    it('does nothing on actions while no community is loaded', () => {
      communities['get'].mockReturnValue(throwError(() => ({ status: 404 })));
      open();

      page.join();
      page.leave();
      page.remove();
      page.invite();
      page.newEvent();
      page.setRole(member('lea'), 'ADMIN');
      page.removeMember(member('lea'));
      page.revoke(invitation);

      expect(dialog.open).not.toHaveBeenCalled();
      expect(communities['join']).not.toHaveBeenCalled();
      expect(communities['changeRole']).not.toHaveBeenCalled();
      expect(communities['revoke']).not.toHaveBeenCalled();
    });
  });

  it('nameOf_shouldNotAskAboutDeletion_beforeMembersAreLoaded', () => {
    communities['members'].mockReturnValue(new Subject<CommunityMember[]>());
    open();

    expect(page.nameOf('gone')).toBe('Ancien membre');
    expect(deletedUsers.isDeleted).not.toHaveBeenCalled();
  });
});
