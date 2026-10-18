import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, ParamMap, Router, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { LOCALE_ID, signal } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { FriendProfileComponent } from './friend-profile';
import { SocialService } from '../../services/social.service';
import { UserService } from '../../services/user.service';
import { EventService, FeedEvent, FriendOverview } from '../../services/event.service';
import { ChatService } from '../../services/chat.service';
import { AvatarService } from '../../services/avatar.service';
import { SocialPerson } from '../../models/friendship.model';
import { DeletedUsersService } from '../../services/deleted-users.service';
import { deletedUsersStub } from '../../../testing/deleted-users.stub';
import { CelebrationService } from '../../services/celebration.service';

vi.mock('rsocket-core', () => import('../../../testing/rsocket-core.stub'));
vi.mock('rsocket-websocket-client', () => import('../../../testing/rsocket-websocket-client.stub'));

registerLocaleData(localeFr);

const httpError = (status: number) => new HttpErrorResponse({ status });

describe('FriendProfileComponent', () => {
  let fixture: ComponentFixture<FriendProfileComponent>;
  let component: FriendProfileComponent;
  let params: BehaviorSubject<ParamMap>;
  let snapshot: { queryParamMap: ParamMap };
  let router: Router;
  let social: Record<string, ReturnType<typeof vi.fn>>;
  let users: { currentUser$: unknown; getFriendProfile: ReturnType<typeof vi.fn> };
  let events: Record<string, ReturnType<typeof vi.fn>>;
  let chat: { getConversation: ReturnType<typeof vi.fn> };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let deletedUsers: ReturnType<typeof deletedUsersStub>;

  const person = (overrides: Partial<SocialPerson> = {}): SocialPerson => ({
    userId: 'lea', userName: 'lea', hashtag: 6000, relationStatus: 'FRIENDS', closeness: 'CLOSE', proposal: null,
    proposedByFriend: false, since: '2025-10-03T08:00:00.123456789Z', ...overrides
  });
  const feedEvent = (id: string, start: Date): FeedEvent => ({
    id, title: `Event ${id}`, organizerId: 'lea', startDate: start, endDate: new Date(start.getTime() + 7_200_000),
    location: 'Chez Léa', image: null, description: ''
  });
  const overview = (overrides: Partial<FriendOverview> = {}): FriendOverview => ({
    outingsTogether: 12,
    upcomingTogether: [feedEvent('together', new Date(2099, 0, 2, 19))],
    memoriesTogether: [feedEvent('memory', new Date(2026, 0, 2, 19))],
    friendUpcoming: [feedEvent('hers', new Date(2099, 0, 3, 19)), feedEvent('other', new Date(2099, 0, 4, 19))],
    ...overrides
  });

  const today = (hour: number, minute = 0) => {
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    return date;
  };
  const inDays = (days: number, hour: number) => {
    const date = today(hour);
    date.setDate(date.getDate() + days);
    return date;
  };

  const create = async () => {
    fixture = TestBed.createComponent(FriendProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const text = () => fixture.nativeElement.textContent as string;
  const button = (label: string) => ([...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[])
    .find(candidate => candidate.textContent?.includes(label));

  beforeEach(async () => {
    params = new BehaviorSubject(convertToParamMap({ userId: 'lea' }));
    snapshot = { queryParamMap: convertToParamMap({}) };
    social = {
      getPerson: vi.fn().mockReturnValue(of(person())),
      getMutualFriends: vi.fn().mockReturnValue(of([{ userId: 'hugo', userName: 'hugo', hashtag: 9074 }, { userId: 'me', userName: 'moi', hashtag: 1 }])),
      requestCloseness: vi.fn().mockReturnValue(of({})),
      acceptCloseness: vi.fn().mockReturnValue(of({})),
      declineCloseness: vi.fn().mockReturnValue(of({})),
      removeFriend: vi.fn().mockReturnValue(of(undefined)),
      sendFriendRequest: vi.fn().mockReturnValue(of({})),
      acceptFriend: vi.fn().mockReturnValue(of(undefined)),
      rejectFriend: vi.fn().mockReturnValue(of(undefined))
    };
    users = {
      currentUser$: of({ id: 'me' }),
      getFriendProfile: vi.fn().mockReturnValue(of({
        id: 'lea', userName: 'lea', hashtag: 6000, firstName: 'Léa', lastName: 'Martin', joinedDate: '2026-01-15T10:30:00',
        bio: 'Toujours partante', interests: ['Rando', 'Ciné'], birthday: { month: 3, day: 12 }
      }))
    };
    events = {
      getFriendOverview: vi.fn().mockReturnValue(of(overview())),
      getFriendCalendar: vi.fn().mockReturnValue(of([
        { start: inDays(1, 12), end: inDays(1, 13), eventId: null, title: null, location: null, description: null },
        { start: inDays(2, 20), end: inDays(2, 22), eventId: 'e', title: 'Concert', location: 'Zénith', description: null }
      ])),
      findFreeSlots: vi.fn().mockReturnValue(of([{ start: inDays(3, 0), end: inDays(4, 0) }])),
      toggleSubscription: vi.fn().mockReturnValue(of(feedEvent('hers', new Date(2099, 0, 3, 19))))
    };
    chat = { getConversation: vi.fn().mockReturnValue(of({ id: 'conv-1' })) };
    dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }) };
    deletedUsers = deletedUsersStub(['gone']);

    await TestBed.configureTestingModule({
      imports: [FriendProfileComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'fr-FR' },
        { provide: ActivatedRoute, useValue: { paramMap: params, snapshot } },
        { provide: SocialService, useValue: social },
        { provide: UserService, useValue: users },
        { provide: EventService, useValue: events },
        { provide: ChatService, useValue: chat },
        { provide: AvatarService, useValue: { url: () => signal(null) } },
        { provide: DeletedUsersService, useValue: deletedUsers }
      ]
    }).overrideComponent(FriendProfileComponent, {
      set: { providers: [{ provide: MatDialog, useValue: dialog }] }
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => vi.useRealTimers());

  describe('as a friend', () => {
    beforeEach(create);

    it('template_shouldShowTheHeader', () => {
      expect(component.isFriend()).toBe(true);
      expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Léa Martin');
      expect(text()).toContain('lea#6000');
      expect(text()).toContain('Toujours partante');
      expect(text()).toContain('Rando');
      expect(text()).toContain('Amis depuis octobre 2025');
      expect(fixture.nativeElement.querySelector('.closeness-badge').textContent).toContain('Proche');
    });

    it('birthdayLabel_shouldShowTheDayAndMonth_neverTheYear', () => {
      expect(component.birthdayLabel()).toBe('12 mars');
      expect(fixture.nativeElement.querySelector('.birthday').textContent).toContain('🎂 12 mars');
    });

    it('since_shouldReadAnInstantWithNanoseconds', () => {
      expect(component.since()?.toISOString()).toBe('2025-10-03T08:00:00.123Z');
    });

    it('template_shouldShowTheWeek_withBusyTitlesAndFreeTime', () => {
      expect(component.week().length).toBe(7);
      expect(component.week()[1].entries.length).toBe(1);
      expect(component.week()[3].free).toEqual([{ start: inDays(3, 8), end: inDays(3, 23) }]);
      expect(text()).toContain('Occupé');
      expect(text()).toContain('Concert');
      expect(text()).toContain('Zénith');
      expect(text()).toContain('Libres ensemble 08:00–23:00');
    });

    it('template_shouldShowWhatWeShare', () => {
      expect(text()).toContain('12 sorties ensemble');
      expect(fixture.nativeElement.querySelector('.memory').getAttribute('href')).toBe('/event/memory');
      expect(fixture.nativeElement.querySelector('.upcoming-item').getAttribute('href')).toBe('/event/together');
    });

    it('template_shouldLinkTheMutualFriends_andMeToMyProfile', () => {
      const links = [...fixture.nativeElement.querySelectorAll('.mutual-link')].map(link => link.getAttribute('href'));
      expect(links).toEqual(['/friends/hugo', '/profile']);
    });

    it('fetch_shouldAskTheCalendarForTheNextSevenDays', () => {
      const [id, from, to] = events['getFriendCalendar'].mock.calls[0];
      expect(id).toBe('lea');
      expect(to.getTime() - from.getTime()).toBe(7 * 86_400_000);
      expect(events['findFreeSlots']).toHaveBeenCalledWith(expect.objectContaining({ friendIds: ['lea'] }));
    });

    it('openChat_shouldOpenTheConversation', () => {
      button('Message')!.click();

      expect(chat.getConversation).toHaveBeenCalledWith('lea');
      expect(router.navigate).toHaveBeenCalledWith(['/chat', 'conv-1']);
    });

    it('openChat_shouldSayWhy_whenItFails', () => {
      chat.getConversation.mockReturnValue(throwError(() => new Error('down')));

      component.openChat();
      fixture.detectChanges();

      expect(component.actionError()).toBe('Impossible d\'ouvrir la discussion');
      expect(component.busy()).toBe(false);
    });

    it('closenessOptions_shouldFollowTheCardRules', () => {
      expect(component.closenessOptions().map(option => option.label)).toEqual(['Redescendre à Ami', 'Proposer : Intime']);
    });

    it('changeCloseness_shouldAskThenReload', () => {
      component.changeCloseness('INTIMATE');

      expect(social['requestCloseness']).toHaveBeenCalledWith('lea', 'INTIMATE');
      expect(social['getPerson']).toHaveBeenCalledTimes(2);
    });

    it('changeCloseness_shouldExplainAConflict', () => {
      social['requestCloseness'].mockReturnValue(throwError(() => httpError(409)));

      component.changeCloseness('INTIMATE');

      expect(component.actionError()).toContain('au même moment');
    });

    it('withdrawProposal_shouldAskForTheCurrentLevel', () => {
      social['getPerson'].mockReturnValue(of(person({ proposal: 'INTIMATE' })));
      component.reload();
      fixture.detectChanges();

      expect(component.outgoingProposal()).toBe('Intime');
      component.withdrawProposal();

      expect(social['requestCloseness']).toHaveBeenCalledWith('lea', 'CLOSE');
    });

    it('answerProposal_shouldAcceptOrDecline', async () => {
      social['getPerson'].mockReturnValue(of(person({ proposal: 'INTIMATE', proposedByFriend: true })));
      component.reload();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.closeness-proposal').textContent).toContain('Intime');
      component.answerProposal(true);
      component.answerProposal(false);

      expect(social['acceptCloseness']).toHaveBeenCalledWith('lea');
      expect(social['declineCloseness']).toHaveBeenCalledWith('lea');
    });

    it('answerProposal_shouldCelebrateTheNewLevel_whenAccepted', () => {
      social['acceptCloseness'].mockReturnValue(of({ friendId: 'lea', closeness: 'INTIMATE', proposal: null, proposedByFriend: false }));

      component.answerProposal(true);

      expect(TestBed.inject(CelebrationService).closeness()).toMatchObject({ name: 'lea', closeness: 'INTIMATE' });
    });

    it('answerProposal_shouldNotCelebrate_whenDeclined', () => {
      component.answerProposal(false);

      expect(TestBed.inject(CelebrationService).closeness()).toBeNull();
    });

    it('template_shouldLinkToTheMemories', () => {
      const link = fixture.nativeElement.querySelector('.memories-link') as HTMLAnchorElement;

      expect(link.textContent).toContain('Vos souvenirs');
      expect(link.getAttribute('href')).toBe('/friends/lea/memories');
    });

    it('removeFriend_shouldConfirmThenGoBackToTheFriends', () => {
      button('Retirer')!.click();

      expect(dialog.open).toHaveBeenCalled();
      expect(social['removeFriend']).toHaveBeenCalledWith('lea');
      expect(router.navigate).toHaveBeenCalledWith(['/friends']);
    });

    it('removeFriend_shouldDoNothing_whenNotConfirmed', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(false) });

      component.removeFriend();

      expect(social['removeFriend']).not.toHaveBeenCalled();
    });

    it('removeFriend_shouldSayWhy_whenItFails', () => {
      social['removeFriend'].mockReturnValue(throwError(() => new Error('down')));

      component.removeFriend();

      expect(component.actionError()).toBe('Impossible de retirer cet ami');
    });

    it('join_shouldRemoveTheCard_onSuccess', () => {
      button('Rejoindre')!.click();
      fixture.detectChanges();

      expect(events['toggleSubscription']).toHaveBeenCalledWith(expect.objectContaining({ id: 'hers' }));
      expect(component.page().overview!.friendUpcoming.map(event => event.id)).toEqual(['other']);
      expect(fixture.nativeElement.querySelectorAll('.outing').length).toBe(1);
    });

    it('join_shouldKeepTheCardAndSayWhy_onFailure', () => {
      events['toggleSubscription'].mockReturnValue(throwError(() => new Error('down')));

      component.join(component.page().overview!.friendUpcoming[0]);
      fixture.detectChanges();

      expect(component.page().overview!.friendUpcoming.length).toBe(2);
      expect(text()).toContain('Impossible de rejoindre « Event hers »');
      expect(component.joining()).toBeNull();
    });

    it('proposeOuting_shouldOpenTheCalendarWithTheEveningSlots', () => {
      button('Proposer une sortie')!.click();

      expect(router.navigate).toHaveBeenCalledWith(['/calendar'], {
        state: { proposeSlots: [{ start: inDays(3, 18), end: inDays(3, 20) }], proposeWith: 'lea' }
      });
    });

    it('proposeOuting_shouldSendNoSlot_withoutFreeTime', () => {
      component.page.update(page => ({ ...page, free: null }));

      component.proposeOuting();

      expect(router.navigate).toHaveBeenCalledWith(['/calendar'], { state: { proposeSlots: [], proposeWith: 'lea' } });
    });

    it('open_shouldLoadAnotherPerson_whenTheLinkChanges', async () => {
      social['getPerson'].mockReturnValue(of(person({ userId: 'hugo', userName: 'hugo', relationStatus: 'NONE', closeness: null, since: null })));

      params.next(convertToParamMap({ userId: 'hugo' }));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(social['getPerson']).toHaveBeenLastCalledWith('hugo');
      expect(component.userId()).toBe('hugo');
      expect(component.isFriend()).toBe(false);
    });
  });

  describe('from a reunion nudge', () => {
    beforeEach(() => {
      snapshot.queryParamMap = convertToParamMap({ propose: '1' });
    });

    it('open_shouldProposeTheOuting_onceThePageIsRead', async () => {
      await create();

      expect(router.navigate).toHaveBeenCalledWith(['/calendar'], {
        state: { proposeSlots: [{ start: inDays(3, 18), end: inDays(3, 20) }], proposeWith: 'lea' },
        replaceUrl: true
      });
    });

    it('open_shouldStayOnThePage_whenNotFriends', async () => {
      social['getPerson'].mockReturnValue(of(person({ relationStatus: 'NONE', closeness: null, since: null })));

      await create();

      expect(router.navigate).not.toHaveBeenCalledWith(['/calendar'], expect.anything());
    });
  });

  describe('when some details cannot be read', () => {
    it('fetch_shouldShowTheRest_whenTheCalendarAndTheOverviewFail', async () => {
      events['getFriendOverview'].mockReturnValue(throwError(() => httpError(502)));
      events['getFriendCalendar'].mockReturnValue(throwError(() => httpError(502)));
      users.getFriendProfile.mockReturnValue(throwError(() => httpError(502)));
      await create();

      expect(component.isFriend()).toBe(true);
      expect(fixture.nativeElement.querySelector('h1').textContent).toContain('lea');
      expect(text()).toContain('Son agenda n’est pas disponible');
      expect(text()).toContain('Vos sorties ne sont pas disponibles');
    });
  });

  describe('as someone who is not a friend', () => {
    const nonFriend = (relationStatus: SocialPerson['relationStatus']) =>
      person({ relationStatus, closeness: null, since: null });

    it('template_shouldBeReduced_andOfferToAdd', async () => {
      social['getPerson'].mockReturnValue(of(nonFriend('NONE')));
      await create();

      expect(component.isFriend()).toBe(false);
      expect(users.getFriendProfile).not.toHaveBeenCalled();
      expect(events['getFriendOverview']).not.toHaveBeenCalled();
      expect(text()).toContain('lea#6000');
      expect(text()).toContain('Amis en commun');
      expect(text()).not.toContain('Cette semaine');

      button('Ajouter')!.click();
      expect(social['sendFriendRequest']).toHaveBeenCalledWith('lea#6000');
      expect(social['getPerson']).toHaveBeenCalledTimes(2);
    });

    it('template_shouldSayTheRequestWasSent', async () => {
      social['getPerson'].mockReturnValue(of(nonFriend('SENT_BY_ME')));
      await create();

      expect(text()).toContain('Demande envoyée');
      expect(button('Ajouter')).toBeUndefined();
    });

    it('template_shouldOfferToAcceptOrRefuse_anIncomingRequest', async () => {
      social['getPerson'].mockReturnValue(of(nonFriend('SENT_BY_THEM')));
      await create();

      button('Accepter')!.click();
      button('Refuser')!.click();

      expect(social['acceptFriend']).toHaveBeenCalledWith('lea');
      expect(social['rejectFriend']).toHaveBeenCalledWith('lea');
    });

    it('addFriend_shouldSayWhy_whenItFails', async () => {
      social['getPerson'].mockReturnValue(of(nonFriend('NONE')));
      social['sendFriendRequest'].mockReturnValue(throwError(() => new Error('down')));
      await create();

      component.addFriend();
      fixture.detectChanges();

      expect(text()).toContain('Impossible d\'envoyer la demande');
    });

    it('fetch_shouldShowTheReducedPage_whenTheProfileAnswers403', async () => {
      users.getFriendProfile.mockReturnValue(throwError(() => httpError(403)));
      await create();

      expect(component.page().forbidden).toBe(true);
      expect(component.isFriend()).toBe(false);
      expect(text()).not.toContain('Cette semaine');
    });
  });

  describe('states', () => {
    it('template_shouldSayThePersonIsUnknown_on404', async () => {
      social['getPerson'].mockReturnValue(throwError(() => httpError(404)));
      await create();

      expect(component.page().state).toBe('notFound');
      expect(text()).toContain('Personne introuvable');
    });

    it('fetch_shouldShowTheDeletedState_whenThePersonIs404AndConfirmedDeleted', async () => {
      params.next(convertToParamMap({ userId: 'gone' }));
      social['getPerson'].mockReturnValue(throwError(() => httpError(404)));
      await create();

      expect(deletedUsers.check).toHaveBeenCalledWith('gone');
      expect(component.page().state).toBe('deleted');
    });

    it('fetch_shouldShowNotFound_whenThePersonIs404AndNotDeleted', async () => {
      social['getPerson'].mockReturnValue(throwError(() => httpError(404)));
      await create();

      expect(deletedUsers.check).toHaveBeenCalledWith('lea');
      expect(component.page().state).toBe('notFound');
    });

    it('fetch_shouldShowNotFound_whenTheDeletionCheckFails', async () => {
      social['getPerson'].mockReturnValue(throwError(() => httpError(404)));
      deletedUsers.check.mockReturnValue(throwError(() => httpError(503)));
      await create();

      expect(component.page().state).toBe('notFound');
    });

    it('fetch_shouldNotAskWelyUsers_whenTheIdIsNotAUserId', async () => {
      social['getPerson'].mockReturnValue(throwError(() => httpError(400)));
      await create();

      expect(deletedUsers.check).not.toHaveBeenCalled();
      expect(component.page().state).toBe('notFound');
    });

    it('fetch_shouldShowTheDeletedState_whenTheFriendProfileAnswers410', async () => {
      // wely-social has not processed USER_DELETED yet, wely-users already answers 410.
      users.getFriendProfile.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 410, error: { code: 'USR-BUS-012' } })));
      await create();

      expect(component.page().state).toBe('deleted');
    });

    it('template_shouldShowTheDeletedCard', async () => {
      params.next(convertToParamMap({ userId: 'gone' }));
      social['getPerson'].mockReturnValue(throwError(() => httpError(404)));
      await create();

      const card = fixture.nativeElement.querySelector('.state-card') as HTMLElement;
      expect(card.querySelector('h1')?.textContent).toBe('Compte supprimé');
      expect(card.textContent).toContain('Cette personne a supprimé son compte Wely.');
      expect(card.querySelector('a')?.getAttribute('href')).toBe('/friends');
    });

    it('template_shouldOfferToRetry_onAnotherError', async () => {
      social['getPerson'].mockReturnValue(throwError(() => httpError(500)));
      await create();

      expect(text()).toContain('Page indisponible');
      social['getPerson'].mockReturnValue(of(person()));
      button('Réessayer')!.click();
      fixture.detectChanges();

      expect(component.page().state).toBe('ready');
    });

    it('open_shouldSendMeToMyProfile_forMyOwnId', async () => {
      params.next(convertToParamMap({ userId: 'me' }));
      await create();

      expect(router.navigate).toHaveBeenCalledWith(['/profile'], { replaceUrl: true });
      expect(social['getPerson']).not.toHaveBeenCalled();
    });

    it('fetch_shouldSendMeToMyProfile_whenTheGraphSaysSelf', async () => {
      social['getPerson'].mockReturnValue(of(person({ relationStatus: 'SELF' })));
      await create();

      expect(router.navigate).toHaveBeenCalledWith(['/profile'], { replaceUrl: true });
    });

    it('template_shouldShowASkeleton_whileLoading', () => {
      social['getPerson'].mockReturnValue(new Subject<SocialPerson>());
      fixture = TestBed.createComponent(FriendProfileComponent);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    });
  });
});
