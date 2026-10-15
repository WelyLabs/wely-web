import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Subject } from 'rxjs';
import { CallOverlayComponent } from './call-overlay';
import { CallService } from '../../../services/call.service';
import { AvatarService } from '../../../services/avatar.service';
import { callServiceStub } from '../../../../testing/call-service.stub';
import { Call } from '../../../models/call.model';

vi.mock('rsocket-core', () => import('../../../../testing/rsocket-core.stub'));
vi.mock('rsocket-websocket-client', () => import('../../../../testing/rsocket-websocket-client.stub'));

function call(overrides: Partial<Call> = {}): Call {
  return {
    id: 'call-1', conversationId: 'conv-1', startedBy: 'alice', media: 'VIDEO', status: 'RINGING',
    startedAt: '2026-10-15T18:00:00Z', endedAt: null, memberIds: ['alice', 'me'], participants: [], ...overrides,
  };
}

describe('CallOverlayComponent', () => {
  let calls: ReturnType<typeof callServiceStub>;
  let router: { url: string; events: Subject<unknown>; navigate: ReturnType<typeof vi.fn> };

  function create() {
    TestBed.configureTestingModule({
      imports: [CallOverlayComponent],
      providers: [
        { provide: CallService, useValue: calls },
        { provide: Router, useValue: router },
        { provide: AvatarService, useValue: { url: () => signal(null) } },
      ],
    });
    const fixture = TestBed.createComponent(CallOverlayComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    calls = callServiceStub();
    router = { url: '/calendar', events: new Subject(), navigate: vi.fn().mockResolvedValue(true) };
  });

  it('template_shouldShowNothing_withoutACall', () => {
    expect(create().nativeElement.textContent.trim()).toBe('');
  });

  it('incoming_shouldNameTheCaller_andTheKindOfCall', () => {
    calls.incoming.set(call({ memberIds: ['alice', 'me', 'bob'] }));

    const text = create().nativeElement.textContent as string;

    expect(text).toContain('Alice');
    expect(text).toContain('Appel vidéo de groupe');
  });

  it('accept_shouldJoin_thenOpenTheCall', async () => {
    calls.incoming.set(call());
    calls.join.mockResolvedValue(call());
    const fixture = create();

    (fixture.nativeElement.querySelector('[aria-label="Répondre en vidéo"]') as HTMLButtonElement).click();
    await Promise.resolve();

    expect(calls.join).toHaveBeenCalledWith('call-1', 'VIDEO');
    expect(router.navigate).toHaveBeenCalledWith(['/call', 'call-1']);
  });

  it('accept_shouldOfferToAnswerAVideoCallWithoutCamera', () => {
    calls.incoming.set(call());
    const fixture = create();

    (fixture.nativeElement.querySelector('[aria-label="Répondre sans caméra"]') as HTMLButtonElement).click();

    expect(calls.join).toHaveBeenCalledWith('call-1', 'AUDIO');
  });

  it('decline_shouldRefuseTheCall', () => {
    calls.incoming.set(call());
    const fixture = create();

    (fixture.nativeElement.querySelector('[aria-label="Refuser"]') as HTMLButtonElement).click();

    expect(calls.decline).toHaveBeenCalledWith(call());
  });

  it('returnBar_shouldShowAwayFromTheCall_andHideOnItsScreen', () => {
    calls.call.set(call({ status: 'ACTIVE' }));
    const fixture = create();
    expect(fixture.nativeElement.querySelector('.return-bar')).not.toBeNull();

    (fixture.nativeElement.querySelector('.return-bar .back') as HTMLButtonElement).click();
    expect(router.navigate).toHaveBeenCalledWith(['/call', 'call-1']);
    (fixture.nativeElement.querySelector('.return-bar .hang-up') as HTMLButtonElement).click();
    expect(calls.leave).toHaveBeenCalled();

    router.events.next(new NavigationEnd(1, '/call/call-1', '/call/call-1'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.return-bar')).toBeNull();
  });
});
