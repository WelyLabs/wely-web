import 'zone.js';
import 'zone.js/testing';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { rsocketStub } from '../../testing/rsocket-core.stub';
import { ChatService, PendingMessage } from './chat.service';
import { UserService } from './user.service';
import { environment } from '../../environments/environment';
import { MessageType } from '../models/chat.model';

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

    expect(received).toEqual([{ id: 'm-1', content: 'hi' }]);
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
});
