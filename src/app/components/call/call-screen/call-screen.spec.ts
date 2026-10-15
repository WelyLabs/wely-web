import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { CallScreenComponent } from './call-screen';
import { CallService } from '../../../services/call.service';
import { AvatarService } from '../../../services/avatar.service';
import { ChatService } from '../../../services/chat.service';
import { NavigationService } from '../../../services/navigation.service';
import { UserService } from '../../../services/user.service';
import { callServiceStub } from '../../../../testing/call-service.stub';
import { Call } from '../../../models/call.model';
import { FakeMediaStream, FakeTrack } from '../../../../testing/webrtc.stub';

vi.mock('rsocket-core', () => import('../../../../testing/rsocket-core.stub'));
vi.mock('rsocket-websocket-client', () => import('../../../../testing/rsocket-websocket-client.stub'));

function call(overrides: Partial<Call> = {}): Call {
  return {
    id: 'call-1', conversationId: 'conv-1', startedBy: 'me', media: 'VIDEO', status: 'ACTIVE',
    startedAt: new Date(Date.now() - 75_000).toISOString(), endedAt: null, memberIds: ['me', 'alice'],
    participants: [], ...overrides,
  };
}

describe('CallScreenComponent', () => {
  let calls: ReturnType<typeof callServiceStub>;
  let navigation: { back: ReturnType<typeof vi.fn> };
  let chat: { getConversationById: ReturnType<typeof vi.fn> };

  function create(callId = 'call-1') {
    TestBed.configureTestingModule({
      imports: [CallScreenComponent],
      providers: [
        { provide: CallService, useValue: calls },
        { provide: NavigationService, useValue: navigation },
        { provide: ChatService, useValue: chat },
        { provide: UserService, useValue: { getCurrentUserValue: () => ({ id: 'me' }) } },
        { provide: AvatarService, useValue: { url: () => signal(null) } },
        { provide: BreakpointObserver, useValue: { observe: () => of({ matches: true }) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ callId }) } } },
      ],
    });
    const fixture = TestBed.createComponent(CallScreenComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    calls = callServiceStub();
    navigation = { back: vi.fn() };
    chat = { getConversationById: vi.fn().mockReturnValue(of({ title: 'Apéro sur les quais' })) };
  });

  it('constructor_shouldJoinTheCallInTheUrl_whenNotInItYet', () => {
    create('call-9');

    expect(calls.join).toHaveBeenCalledWith('call-9');
  });

  it('constructor_shouldGoBack_whenJoiningFails', async () => {
    create('call-9');
    await Promise.resolve();
    await Promise.resolve();

    expect(navigation.back).toHaveBeenCalled();
  });

  it('template_shouldNameADirectCallAfterTheOtherPerson_andShowItsDuration', () => {
    calls.call.set(call());
    calls.connection.set('connected');
    calls.participants.set([{ userId: 'alice', stream: new FakeMediaStream() as unknown as MediaStream, hasVideo: false }]);

    const fixture = create();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Alice');
    expect(text).toMatch(/1:1\d/);
    expect(calls.join).not.toHaveBeenCalled();
  });

  it('template_shouldNameAGroupCallAfterItsEvent', () => {
    calls.call.set(call({ memberIds: ['me', 'alice', 'bob'] }));

    const fixture = create();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Apéro sur les quais');
  });

  it('template_shouldSayItRings_whileNobodyElseIsIn', () => {
    calls.call.set(call({ status: 'RINGING' }));
    calls.connection.set('connected');

    const fixture = create();

    expect(fixture.nativeElement.querySelector('.waiting').textContent).toContain('Ça sonne…');
  });

  it('template_shouldShowCamerasAndTheUsersOwnPreview', () => {
    calls.call.set(call());
    calls.cameraOn.set(true);
    calls.localStream.set(new FakeMediaStream([new FakeTrack('video')]) as unknown as MediaStream);
    calls.participants.set([{ userId: 'alice', stream: new FakeMediaStream() as unknown as MediaStream, hasVideo: true }]);

    const fixture = create();

    expect(fixture.nativeElement.querySelectorAll('.tile video').length).toBe(1);
    expect(fixture.nativeElement.querySelector('video.self')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="Changer de caméra"]')).not.toBeNull();
  });

  it('controls_shouldDriveTheCall', () => {
    calls.call.set(call());
    const fixture = create();
    const button = (label: string) => fixture.nativeElement.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement;

    button('Couper le micro').click();
    button('Activer la caméra').click();
    button('Raccrocher').click();
    button("Revenir à l'application").click();

    expect(calls.toggleMute).toHaveBeenCalled();
    expect(calls.toggleCamera).toHaveBeenCalled();
    expect(calls.leave).toHaveBeenCalled();
    expect(navigation.back).toHaveBeenCalled();
  });

  it('effect_shouldGoBack_onceTheCallIsOver', () => {
    calls.call.set(call());
    const fixture = create();

    calls.call.set(null);
    fixture.detectChanges();

    expect(navigation.back).toHaveBeenCalled();
  });
});
