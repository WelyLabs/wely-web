import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { rsocketStub } from '../../testing/rsocket-core.stub';
import { ChatService, PendingMessage, chatErrorCode, upsertById } from './chat.service';
import { UserService } from './user.service';
import { environment } from '../../environments/environment';
import { Message, MessageType } from '../models/chat.model';
import { LoggerService } from '../core/logging/logger.service';
import { rsocketApplicationError, rsocketProblemJson } from '../../testing/rsocket-error';

// The RSocket modules are replaced by the shared stub in src/testing. The factory re-exports
// the module rather than redefining an object, so the service and the test work on the same
// state — a Vite alias created two separate module instances instead.
vi.mock('rsocket-core', () => import('../../testing/rsocket-core.stub'));
vi.mock('rsocket-websocket-client', () => import('../../testing/rsocket-websocket-client.stub'));

/**
 * These tests drive the public surface only.
 *
 * <p>An earlier version reached into private fields by name — `service['isReconnecting']`
 * — so renaming an internal broke the suite without any behaviour changing. It also
 * asserted that the constructor opened a connection, which is precisely what no longer
 * happens: a root-provided service connecting at construction fires for signed-out
 * visitors and leaked reconnect timers between test files.
 *
 * <p>The RSocket modules are replaced by the shared stub in src/testing, so this file
 * drives {@link rsocketStub} to shape connection, delivery and stream behaviour.
 */
describe('ChatService', () => {
  let service: ChatService;
  let httpMock: HttpTestingController;
  let userService: {
    getAccessToken: ReturnType<typeof vi.fn>;
    getCurrentUserValue: ReturnType<typeof vi.fn>;
  };
  const apiUrl = `${environment.apiUrl}/chat-service`;

  beforeEach(() => {
    rsocketStub.reset();

    userService = {
      getAccessToken: vi.fn().mockReturnValue('mock-token'),
      getCurrentUserValue: vi.fn().mockReturnValue({ id: 'user1', userName: 'theo' }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ChatService,
        { provide: UserService, useValue: userService },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(ChatService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.ngOnDestroy();
    httpMock.verify();
  });

  // --- other streams -------------------------------------------------------

  it('openStream_shouldRelayAnotherRouteFrames_withBoundedDemand', () => {
    const frames: unknown[] = [];
    const subscription = service.openStream<{ type: string }>('call.events').subscribe(frame => frames.push(frame));

    rsocketStub.emit({ type: 'RINGING' });
    rsocketStub.emit(null);

    expect(frames).toEqual([{ type: 'RINGING' }]);
    expect(rsocketStub.requestedDemand).toContain(64);
    subscription.unsubscribe();
  });

  // --- lazy connection ---------------------------------------------------

  it('ne se connecte pas à la construction', () => {
    expect(rsocketStub.connectAttempts).toBe(0);
  });

  it('se connecte au premier usage, une seule fois', () => {
    service.initializeStream();
    service.initializeStream();

    expect(rsocketStub.connectAttempts).toBe(1);
  });

  // --- HTTP ---------------------------------------------------------------

  it('liste les conversations de l’utilisateur', async () => {
    const pending = firstValueFrom(service.getAllConversations());

    const request = httpMock.expectOne(`${apiUrl}/conversations/all`);
    expect(request.request.method).toBe('GET');
    request.flush([]);

    await expect(pending).resolves.toEqual([]);
  });

  it('lit la présence d’un participant', async () => {
    const presence = { userId: 'friend-1', online: true, lastSeenAt: '2026-10-11T18:00:00Z' };
    const pending = firstValueFrom(service.getPresence('friend-1'));

    const request = httpMock.expectOne(`${apiUrl}/presence/friend-1`);
    expect(request.request.method).toBe('GET');
    request.flush(presence);

    await expect(pending).resolves.toEqual(presence);
  });

  it('getEventConversation_shouldReadTheEventsGroup', async () => {
    const conversation = { id: 'conv-1', participantIds: ['me'], messages: [], bucketIndex: 0 };
    const pending = firstValueFrom(service.getEventConversation('ev-1'));

    const request = httpMock.expectOne(`${apiUrl}/conversations/events/ev-1`);
    expect(request.request.method).toBe('GET');
    request.flush(conversation);

    await expect(pending).resolves.toEqual(conversation);
  });

  it('récupère ou crée une conversation à partir de l’ami visé', async () => {
    const pending = firstValueFrom(service.getConversation('friend-1'));

    const request = httpMock.expectOne((r) => r.url === `${apiUrl}/conversations`);
    expect(request.request.params.get('friendId')).toBe('friend-1');
    request.flush({ id: 'conv-1' });

    await pending;
  });

  it('pagine l’historique par index de bucket', async () => {
    const pending = firstValueFrom(service.getMessages('conv-1', 3));

    const request = httpMock.expectOne(
      (r) => r.url === `${apiUrl}/conversations/conv-1/loadMessages`,
    );
    expect(request.request.params.get('bucketIndex')).toBe('3');
    request.flush({ conversationId: 'conv-1', bucketIndex: 3, messages: [] });

    await pending;
  });

  // --- sending -------------------------------------------------------------

  it('émet d’abord une copie optimiste, puis la version acquittée', async () => {
    const emissions = (await firstValueFrom(
      service.sendMessage('conv-1', 'hello', 'friend-1').pipe(toArray()),
    )) as PendingMessage[];

    expect(emissions).toHaveLength(2);

    expect(emissions[0].pending).toBe(true);
    expect(emissions[0].content).toBe('hello');
    expect(emissions[0].senderId).toBe('user1');
    expect(emissions[0].type).toBe(MessageType.TEXT);

    // L'identifiant local est remplacé par celui du serveur à l'acquittement.
    expect(emissions[1].pending).toBe(false);
    expect(emissions[1].id).toBe('server-id-1');
  });

  it('sendMessage_shouldKeepTheLocalId_andTakeTheServersTime', async () => {
    rsocketStub.responsePayload = { data: { id: null, content: 'hello', timestamp: '2026-10-12T23:44:46Z' } };

    const emissions = (await firstValueFrom(
      service.sendMessage('conv-1', 'hello', 'friend-1').pipe(toArray()),
    )) as PendingMessage[];

    expect(emissions[1].pending).toBe(false);
    expect(emissions[1].id).toBe(emissions[0].id);
    expect(emissions[1].timestamp).toBe('2026-10-12T23:44:46Z');
  });

  it('signale un échec de livraison au lieu de le passer sous silence', async () => {
    rsocketStub.responseBehaviour = 'failure';
    const seen: PendingMessage[] = [];

    await expect(
      new Promise<void>((resolve, reject) => {
        service.sendMessage('conv-1', 'hello', 'friend-1').subscribe({
          next: (message) => seen.push(message),
          error: reject,
          complete: resolve,
        });
      }),
    ).rejects.toThrow('delivery refused');

    // The stream used to be completed before the server answered, so the error that
    // followed was ignored by RxJS and the message stayed shown as sent.
    expect(seen.at(-1)?.failed).toBe(true);
  });

  it('sendMessage_shouldExposeTheProblemCode_andLogItsRequestId_whenTheServerSendsAJsonProblem', async () => {
    const logger = TestBed.inject(LoggerService);
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    rsocketStub.responseBehaviour = 'failure';
    rsocketStub.responseError = rsocketApplicationError(
      rsocketProblemJson('CHT-BUS-003', 403, 'Not a participant of this conversation', 'req-7'));

    let failure: unknown;
    await new Promise<void>((resolve) => {
      service.sendMessage('conv-1', 'hello', 'friend-1').subscribe({
        error: (error: unknown) => { failure = error; resolve(); },
        complete: resolve,
      });
    });

    expect(chatErrorCode(failure)).toBe('CHT-BUS-003');
    expect(logged).toHaveBeenCalledWith(
      'ChatService', 'message delivery failed [code=CHT-BUS-003, status=403, requestId=req-7]', failure);
  });

  it('refuse d’envoyer si aucun utilisateur n’est chargé', async () => {
    userService.getCurrentUserValue.mockReturnValue(null);

    await expect(firstValueFrom(service.sendMessage('conv-1', 'hi', 'friend-1'))).rejects.toThrow(
      /signed out/,
    );
  });

  // --- incoming stream ----------------------------------------------------

  it('pousse les messages reçus sur messages$', () => {
    const received: unknown[] = [];
    service.messages$.subscribe((message) => received.push(message));

    service.initializeStream();
    rsocketStub.emit({ id: 'm-1', content: 'hi' });

    expect(received).toEqual([{ id: 'm-1', content: 'hi', kind: 'NEW' }]);
  });

  it('initializeStream_shouldKeepAnUpdatesKind', () => {
    const received: Message[] = [];
    service.messages$.subscribe((message) => received.push(message));

    service.initializeStream();
    rsocketStub.emit({ id: 'm-1', kind: 'UPDATED', photo: { width: 0, height: 0, url: null, removed: true } });

    expect(received[0].kind).toBe('UPDATED');
  });

  it('demande une quantité bornée plutôt que tout le flux', () => {
    service.initializeStream();

    // Integer.MAX_VALUE réclamerait tout d'un coup et abandonnerait la contre-pression
    // que RSocket existe précisément pour fournir.
    expect(rsocketStub.requestedDemand[0]).toBeGreaterThan(0);
    expect(rsocketStub.requestedDemand[0]).toBeLessThan(1_000);
  });

  it('renouvelle la demande à mesure que les messages sont consommés', () => {
    service.initializeStream();
    const initial = rsocketStub.requestedDemand.length;

    for (let i = 0; i < 40; i++) {
      rsocketStub.emit({ id: `m-${i}` });
    }

    expect(rsocketStub.requestedDemand.length).toBeGreaterThan(initial);
  });

  it('ferme le client à la destruction', () => {
    service.initializeStream();
    service.ngOnDestroy();

    expect(rsocketStub.closeCalls).toBeGreaterThan(0);
  });

  it('initializeStream_shouldStopRetrying_whenTheAccountIsDeleted', () => {
    vi.useFakeTimers();
    service.initializeStream();
    expect(rsocketStub.streamSubscribers).toHaveLength(1);

    rsocketStub.streamSubscribers[0].onError?.(new Error('This account has been deleted.'));
    vi.advanceTimersByTime(60_000);

    expect(rsocketStub.streamSubscribers).toHaveLength(1);
    vi.useRealTimers();
  });

  it('initializeStream_shouldStopRetrying_whenAJsonProblemSaysTheAccountIsDeleted', () => {
    vi.useFakeTimers();
    service.initializeStream();

    rsocketStub.streamSubscribers[0].onError?.(rsocketApplicationError(
      rsocketProblemJson('CHT-BUS-011', 403, 'Account gone')));
    vi.advanceTimersByTime(60_000);

    expect(rsocketStub.streamSubscribers).toHaveLength(1);
    vi.useRealTimers();
  });

  it('initializeStream_shouldRetry_afterAnotherFailure', () => {
    vi.useFakeTimers();
    service.initializeStream();

    rsocketStub.streamSubscribers[0].onError?.(new Error('connection lost'));
    vi.advanceTimersByTime(1_000);

    expect(rsocketStub.streamSubscribers).toHaveLength(2);
    vi.useRealTimers();
  });

  it('openStream_shouldStopRetrying_whenTheAccountIsDeleted', () => {
    vi.useFakeTimers();
    let failure: unknown;
    service.openStream('call.events').subscribe({ error: error => failure = error });

    rsocketStub.streamSubscribers[0].onError?.(new Error('This account has been deleted.'));
    vi.advanceTimersByTime(60_000);

    expect(chatErrorCode(failure)).toBe('CHT-BUS-011');
    expect(rsocketStub.streamSubscribers).toHaveLength(1);
    vi.useRealTimers();
  });
});

describe('chatErrorCode', () => {
  it('chatErrorCode_shouldReadTheCodeOfARestProblem', () => {
    expect(chatErrorCode(new HttpErrorResponse({ status: 409, error: { code: 'CHT-BUS-012' } }))).toBe('CHT-BUS-012');
    expect(chatErrorCode(new HttpErrorResponse({ status: 502, error: null }))).toBeNull();
  });

  it('chatErrorCode_shouldReadTheCodeOfAnRsocketJsonProblem', () => {
    expect(chatErrorCode(rsocketApplicationError(rsocketProblemJson('CHT-BUS-012', 409, 'Read only'))))
      .toBe('CHT-BUS-012');
  });

  it('chatErrorCode_shouldMapTheKnownPlainTextDetails_ofAWrappedApplicationError', () => {
    expect(chatErrorCode(rsocketApplicationError('This account has been deleted.'))).toBe('CHT-BUS-011');
  });

  it('chatErrorCode_shouldMapTheKnownRsocketDetails_toTheirCodes', () => {
    expect(chatErrorCode(new Error('This account has been deleted.'))).toBe('CHT-BUS-011');
    expect(chatErrorCode(new Error('The other participant deleted their account: this conversation can be read, not written to.')))
      .toBe('CHT-BUS-012');
  });

  it('chatErrorCode_shouldFindACodeInTheMessage_orNone', () => {
    expect(chatErrorCode(new Error('CHT-BUS-003 refused'))).toBe('CHT-BUS-003');
    expect(chatErrorCode(new Error('connection lost'))).toBeNull();
    expect(chatErrorCode('nope')).toBeNull();
  });
});

describe('upsertById', () => {
  interface Item { id?: string; text: string }
  const a: Item = { id: 'a', text: 'a' };
  const b: Item = { id: 'b', text: 'b' };

  it('upsertById_shouldAppendANewItem', () => {
    expect(upsertById([a], b)).toEqual([a, b]);
  });

  it('upsertById_shouldReplaceAnItemAlreadyThere_whateverTheKind', () => {
    const changed: Item = { id: 'a', text: 'changed' };

    expect(upsertById([a, b], changed, 'NEW')).toEqual([changed, b]);
    expect(upsertById([a, b], changed, 'UPDATED')).toEqual([changed, b]);
  });

  it('upsertById_shouldIgnoreAnUpdateToAnItemNotThere', () => {
    expect(upsertById([a], b, 'UPDATED')).toEqual([a]);
  });

  it('upsertById_shouldAppendAnItemWithoutId', () => {
    expect(upsertById([a], { id: undefined, text: 'local' })).toHaveLength(2);
  });

  it('upsertById_shouldNotMutateTheList', () => {
    const list = [a];

    upsertById(list, b);

    expect(list).toEqual([a]);
  });
});
