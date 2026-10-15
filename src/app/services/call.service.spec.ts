import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Subject, firstValueFrom, of } from 'rxjs';
import { CallService } from './call.service';
import { ChatService } from './chat.service';
import { UserService } from './user.service';
import { SocialService } from './social.service';
import { NotificationService } from './notification.service';
import { LoggerService } from '../core/logging/logger.service';
import { environment } from '../../environments/environment';
import { Call, CallEvent } from '../models/call.model';
import { FakeMediaStream, FakePeerConnection, FakeTrack } from '../../testing/webrtc.stub';

vi.mock('rsocket-core', () => import('../../testing/rsocket-core.stub'));
vi.mock('rsocket-websocket-client', () => import('../../testing/rsocket-websocket-client.stub'));

const API = `${environment.apiUrl}/chat-service/calls`;
const ICE = [{ urls: ['stun:stun.cloudflare.com:3478'] }];

function call(overrides: Partial<Call> = {}): Call {
  return {
    id: 'call-1', conversationId: 'conv-1', startedBy: 'alice', media: 'AUDIO', status: 'RINGING',
    startedAt: '2026-10-15T18:00:00Z', endedAt: null, memberIds: ['alice', 'me'], participants: [],
    ...overrides,
  };
}

/** Lets the awaited steps of a join run, between HTTP answers. */
const settle = () => new Promise(resolve => setTimeout(resolve));

describe('CallService', () => {
  let service: CallService;
  let http: HttpTestingController;
  let events: Subject<CallEvent>;
  let notifications: { showInfo: ReturnType<typeof vi.fn> };
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('MediaStream', FakeMediaStream);
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    getUserMedia = vi.fn().mockImplementation(async (constraints: MediaStreamConstraints) =>
      new FakeMediaStream([new FakeTrack('audio'), ...(constraints.video ? [new FakeTrack('video')] : [])]));
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), configurable: true });

    events = new Subject<CallEvent>();
    notifications = { showInfo: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ChatService, useValue: { openStream: vi.fn().mockReturnValue(events) } },
        { provide: UserService, useValue: { getCurrentUserValue: () => ({ id: 'me' }) } },
        { provide: SocialService, useValue: { getPerson: vi.fn().mockReturnValue(of({ userName: 'Alice' })) } },
        { provide: NotificationService, useValue: notifications },
        { provide: LoggerService, useValue: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
      ],
    });
    service = TestBed.inject(CallService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** Joins `call-1`, answering each step as wely-chat would. */
  async function joinCall(joined: Call = call({ participants: [{ userId: 'me', joinedAt: '', trackNames: [] }] })) {
    const result = service.join('call-1');
    http.expectOne(`${API}/call-1/join`).flush({ call: joined, iceServers: ICE });
    await settle();
    http.expectOne(`${API}/call-1/publish`).flush({ type: 'answer', sdp: 'relay-answer' });
    await settle();
    return result;
  }

  it('listen_shouldRing_forACallAndStopOnceItEnds', () => {
    service.listen();
    service.listen();

    events.next({ type: 'RINGING', actorId: 'alice', call: call() });
    expect(service.incoming()?.id).toBe('call-1');

    events.next({ type: 'ENDED', actorId: 'alice', call: call({ status: 'MISSED' }) });
    expect(service.incoming()).toBeNull();
    expect(TestBed.inject(ChatService).openStream).toHaveBeenCalledTimes(1);
  });

  it('join_shouldOpenTheMicrophone_andPublishIt_onTheRelay', async () => {
    const joined = await joinCall();

    expect(joined?.id).toBe('call-1');
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ video: false }));
    expect(FakePeerConnection.last?.config.iceServers).toEqual(ICE);
    expect(service.call()?.id).toBe('call-1');
    expect(service.localStream()).not.toBeNull();
    expect(service.cameraOn()).toBe(false);
    http.verify();
  });

  it('join_shouldReceiveThoseAlreadyInTheCall', async () => {
    await joinCall(call({ status: 'ACTIVE', participants: [
      { userId: 'alice', joinedAt: '', trackNames: ['audio'] },
      { userId: 'me', joinedAt: '', trackNames: [] },
    ] }));

    const subscribe = http.expectOne(`${API}/call-1/subscribe`);
    expect(subscribe.request.body).toEqual({ tracks: [{ userId: 'alice', trackName: 'audio', layer: null }] });
    subscribe.flush({ offer: null, requiresRenegotiation: false, tracks: [{ mid: '3', userId: 'alice', trackName: 'audio' }] });
    await settle();

    FakePeerConnection.last!.deliver('3', new FakeTrack('audio'));
    expect(service.participants().map(participant => participant.userId)).toEqual(['alice']);
  });

  it('join_shouldLeaveTheCallAgain_whenTheMicrophoneIsRefused', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));

    const result = service.join('call-1');
    http.expectOne(`${API}/call-1/join`).flush({ call: call(), iceServers: ICE });
    await settle();
    http.expectOne(`${API}/call-1/leave`).flush(null);

    expect(await result).toBeNull();
    expect(service.call()).toBeNull();
    expect(service.connection()).toBe('idle');
    expect(notifications.showInfo).toHaveBeenCalledWith('Autorise le micro (et la caméra) pour appeler.');
  });

  it('start_shouldSayWhenTheCallIsFull', async () => {
    const result = service.start('conv-1', 'VIDEO');
    http.expectOne(API).flush(call({ media: 'VIDEO' }));
    await settle();
    http.expectOne(`${API}/call-1/join`).flush({ code: 'CHT-BUS-009' }, { status: 409, statusText: 'Conflict' });

    expect(await result).toBeNull();
    expect(notifications.showInfo).toHaveBeenCalledWith('L’appel est complet.');
  });

  it('events_shouldReceiveNewTracks_andForgetWhoLeaves', async () => {
    service.listen();
    await joinCall();
    const withAlice = call({ status: 'ACTIVE', participants: [
      { userId: 'me', joinedAt: '', trackNames: ['audio'] },
      { userId: 'alice', joinedAt: '', trackNames: ['audio', 'camera'] },
    ] });

    events.next({ type: 'TRACKS_PUBLISHED', actorId: 'alice', call: withAlice });
    await settle();
    const subscribe = http.expectOne(`${API}/call-1/subscribe`);
    expect(subscribe.request.body.tracks).toEqual([
      { userId: 'alice', trackName: 'audio', layer: null },
      { userId: 'alice', trackName: 'camera', layer: 'FULL' },
    ]);
    subscribe.flush({ offer: { type: 'offer', sdp: 'relay-offer' }, requiresRenegotiation: true, tracks: [
      { mid: '3', userId: 'alice', trackName: 'audio' }, { mid: '4', userId: 'alice', trackName: 'camera' }] });
    await settle();
    http.expectOne(`${API}/call-1/renegotiate`).flush(null);
    await settle();
    FakePeerConnection.last!.deliver('4', new FakeTrack('video'));
    expect(service.participants()[0].hasVideo).toBe(true);

    events.next({ type: 'PARTICIPANT_LEFT', actorId: 'alice', call: call({ status: 'ACTIVE',
      participants: [{ userId: 'me', joinedAt: '', trackNames: ['audio'] }] }) });

    const unsubscribe = http.expectOne(`${API}/call-1/unsubscribe`);
    expect(unsubscribe.request.body).toEqual({ mids: ['3', '4'] });
    expect(service.participants()).toEqual([]);
  });

  it('events_shouldEndTheCallHere_whenItEndsForEveryone', async () => {
    service.listen();
    await joinCall();
    const microphone = service.localStream()!.getTracks()[0] as unknown as FakeTrack;

    events.next({ type: 'ENDED', actorId: 'alice', call: call({ status: 'ENDED' }) });

    expect(service.call()).toBeNull();
    expect(microphone.stop).toHaveBeenCalled();
    expect(FakePeerConnection.last!.close).toHaveBeenCalled();
  });

  it('leave_shouldHangUpAtOnce_andTellTheServer', async () => {
    await joinCall();

    const left = service.leave();
    expect(service.call()).toBeNull();
    http.expectOne(`${API}/call-1/leave`).flush(null);
    await left;
  });

  it('decline_shouldStopRinging_andRefuseTheCall', () => {
    service.listen();
    events.next({ type: 'RINGING', actorId: 'alice', call: call() });

    service.decline(call());

    expect(service.incoming()).toBeNull();
    http.expectOne(`${API}/call-1/decline`).flush(null);
  });

  it('toggleMute_shouldSilenceTheMicrophone_andBack', async () => {
    await joinCall();
    const microphone = service.localStream()!.getAudioTracks()[0];

    service.toggleMute();
    expect(microphone.enabled).toBe(false);
    expect(service.muted()).toBe(true);

    service.toggleMute();
    expect(microphone.enabled).toBe(true);
  });

  it('toggleCamera_shouldPublishTheCameraOnce_inACallStartedWithoutVideo', async () => {
    await joinCall();

    const turnedOn = service.toggleCamera();
    await settle();
    const publish = http.expectOne(`${API}/call-1/publish`);
    expect(publish.request.body.tracks).toEqual([{ mid: '1', trackName: 'camera' }]);
    publish.flush({ type: 'answer', sdp: 'relay-answer' });
    await turnedOn;

    expect(service.cameraOn()).toBe(true);
    await service.toggleCamera();
    expect(service.cameraOn()).toBe(false);
  });

  it('heartbeat_shouldEndTheCallHere_onceTheServerNoLongerKnowsIt', async () => {
    // Only intervals are faked: the join's own steps still need real timeouts to settle.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await joinCall();
    vi.advanceTimersByTime(15_000);

    http.expectOne(`${API}/call-1/heartbeat`).flush({ code: 'CHT-BUS-008' }, { status: 404, statusText: 'Not Found' });

    expect(service.call()).toBeNull();
  });

  it('liveCall_shouldBeNull_whenTheServerAnswersNoContent', async () => {
    const live = firstValueFrom(service.liveCall('conv-1'));
    http.expectOne(`${API}/live?conversationId=conv-1`).flush(null, { status: 204, statusText: 'No Content' });

    expect(await live).toBeNull();
  });

  it('nameOf_shouldAskOnce_perPerson', () => {
    expect(service.nameOf('alice')()).toBe('Alice');
    service.nameOf('alice');

    expect(TestBed.inject(SocialService).getPerson).toHaveBeenCalledTimes(1);
  });
});
