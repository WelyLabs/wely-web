import { vi } from 'vitest';

/** jsdom has no WebRTC: just enough of MediaStream, tracks and RTCPeerConnection to drive the call code. */

export class FakeTrack {
  enabled = true;
  readonly stop = vi.fn();
  constructor(readonly kind: 'audio' | 'video', readonly id = `${kind}-${Math.random().toString(36).slice(2)}`) {}
}

export class FakeMediaStream {
  private readonly tracks: FakeTrack[];
  constructor(tracks: FakeTrack[] = []) {
    this.tracks = [...tracks];
  }
  getTracks(): FakeTrack[] { return [...this.tracks]; }
  getAudioTracks(): FakeTrack[] { return this.tracks.filter(track => track.kind === 'audio'); }
  getVideoTracks(): FakeTrack[] { return this.tracks.filter(track => track.kind === 'video'); }
  addTrack(track: FakeTrack): void { this.tracks.push(track); }
  removeTrack(track: FakeTrack): void { this.tracks.splice(this.tracks.indexOf(track), 1); }
}

export class FakeTransceiver {
  mid: string | null = null;
  readonly sender = { replaceTrack: vi.fn().mockResolvedValue(undefined) };
  constructor(readonly track: unknown, readonly init: RTCRtpTransceiverInit | undefined) {}
}

export class FakePeerConnection {
  static last?: FakePeerConnection;
  readonly transceivers: FakeTransceiver[] = [];
  readonly remoteDescriptions: RTCSessionDescriptionInit[] = [];
  readonly localDescriptions: RTCSessionDescriptionInit[] = [];
  connectionState: RTCPeerConnectionState = 'new';
  ontrack: ((event: { transceiver: { mid: string | null }; track: unknown }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  readonly close = vi.fn();

  constructor(readonly config: RTCConfiguration) {
    FakePeerConnection.last = this;
  }

  addTransceiver(track: unknown, init?: RTCRtpTransceiverInit): FakeTransceiver {
    const transceiver = new FakeTransceiver(track, init);
    this.transceivers.push(transceiver);
    return transceiver;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: `offer-${this.transceivers.length}` };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'browser-answer' };
  }

  /** Like a browser, setting an offer gives each new transceiver its mid. */
  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescriptions.push(description);
    this.transceivers.forEach((transceiver, index) => transceiver.mid ??= String(index));
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescriptions.push(description);
  }

  /** What the relay does once a subscription is answered: tracks start arriving. */
  deliver(mid: string, track: FakeTrack): void {
    this.ontrack?.({ transceiver: { mid }, track });
  }

  changeState(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}
