import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { vi } from 'vitest';
import { Call, CallEvent } from '../app/models/call.model';
import { CallConnection, RemoteParticipant } from '../app/services/call.service';

/** A CallService with no call going on, for components that only show call buttons. */
export function callServiceStub() {
  return {
    incoming: signal<Call | null>(null),
    call: signal<Call | null>(null),
    connection: signal<CallConnection>('idle'),
    localStream: signal<MediaStream | null>(null),
    muted: signal(false),
    cameraOn: signal(false),
    speakerId: signal<string | null>(null),
    participants: signal<RemoteParticipant[]>([]),
    events$: new Subject<CallEvent>(),
    listen: vi.fn(),
    start: vi.fn().mockResolvedValue(null),
    join: vi.fn().mockResolvedValue(null),
    leave: vi.fn().mockResolvedValue(undefined),
    decline: vi.fn(),
    liveCall: vi.fn().mockReturnValue(of(null)),
    toggleMute: vi.fn(),
    toggleCamera: vi.fn().mockResolvedValue(undefined),
    flipCamera: vi.fn().mockResolvedValue(undefined),
    nameOf: vi.fn(() => signal<string | null>('Alice')),
  };
}
