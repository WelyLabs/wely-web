import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CallSession, CallSignaling, SIMULCAST_LAYERS } from './call-session';
import { FakePeerConnection, FakeTrack } from '../../testing/webrtc.stub';

describe('CallSession', () => {
  let signaling: { [K in keyof CallSignaling]: ReturnType<typeof vi.fn> };
  let session: CallSession;
  let peer: FakePeerConnection;

  beforeEach(() => {
    signaling = {
      publish: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'relay-answer' }),
      subscribe: vi.fn(),
      renegotiate: vi.fn().mockResolvedValue(undefined),
    };
    session = new CallSession([{ urls: 'stun:stun.example' }], signaling as unknown as CallSignaling,
      config => new FakePeerConnection(config) as unknown as RTCPeerConnection);
    peer = FakePeerConnection.last!;
  });

  it('constructor_shouldConnectThroughTheGivenIceServers_onOneBundle', () => {
    expect(peer.config.iceServers).toEqual([{ urls: 'stun:stun.example' }]);
    expect(peer.config.bundlePolicy).toBe('max-bundle');
  });

  it('publish_shouldOfferSendOnlyTracks_namedByMid_andApplyTheRelaysAnswer', async () => {
    await session.publish([
      { name: 'audio', track: new FakeTrack('audio') as unknown as MediaStreamTrack },
      { name: 'camera', track: new FakeTrack('video') as unknown as MediaStreamTrack, simulcast: true },
    ]);

    expect(peer.transceivers.map(transceiver => transceiver.init?.direction)).toEqual(['sendonly', 'sendonly']);
    expect(peer.transceivers[0].init?.sendEncodings).toBeUndefined();
    expect(peer.transceivers[1].init?.sendEncodings).toBe(SIMULCAST_LAYERS);
    expect(signaling.publish).toHaveBeenCalledWith({ type: 'offer', sdp: 'offer-2' },
      [{ mid: '0', trackName: 'audio' }, { mid: '1', trackName: 'camera' }]);
    expect(peer.remoteDescriptions).toEqual([{ type: 'answer', sdp: 'relay-answer' }]);
    expect(session.publishes('camera')).toBe(true);
  });

  it('subscribe_shouldAnswerTheRelaysOffer_andNameArrivingTracksByPerson', async () => {
    signaling.subscribe.mockResolvedValue({
      offer: { type: 'offer', sdp: 'relay-offer' },
      requiresRenegotiation: true,
      tracks: [{ mid: '5', userId: 'alice', trackName: 'camera' }],
    });
    const arrived = vi.fn();
    session.onRemoteTrack = arrived;

    const tracks = await session.subscribe([{ userId: 'alice', trackName: 'camera', layer: 'FULL' }]);
    const camera = new FakeTrack('video');
    peer.deliver('5', camera);
    peer.deliver('9', new FakeTrack('video'));

    expect(tracks).toEqual([{ mid: '5', userId: 'alice', trackName: 'camera' }]);
    expect(peer.remoteDescriptions).toEqual([{ type: 'offer', sdp: 'relay-offer' }]);
    expect(signaling.renegotiate).toHaveBeenCalledWith({ type: 'answer', sdp: 'browser-answer' });
    expect(arrived).toHaveBeenCalledTimes(1);
    expect(arrived).toHaveBeenCalledWith({ mid: '5', userId: 'alice', trackName: 'camera', track: camera });
  });

  it('subscribe_shouldNotRenegotiate_whenTheRelayDoesNotAsk', async () => {
    signaling.subscribe.mockResolvedValue({ offer: null, requiresRenegotiation: false, tracks: [] });

    await session.subscribe([{ userId: 'alice', trackName: 'audio', layer: null }]);

    expect(signaling.renegotiate).not.toHaveBeenCalled();
  });

  it('subscribe_shouldAskNothing_forNoTrack', async () => {
    expect(await session.subscribe([])).toEqual([]);
    expect(signaling.subscribe).not.toHaveBeenCalled();
  });

  it('negotiations_shouldRunOneAtATime_evenWhenOneFails', async () => {
    const order: string[] = [];
    signaling.publish.mockImplementation(async () => {
      order.push('publish');
      throw new Error('relay down');
    });
    signaling.subscribe.mockImplementation(async () => {
      order.push('subscribe');
      return { offer: null, requiresRenegotiation: false, tracks: [] };
    });

    const published = session.publish([{ name: 'audio', track: new FakeTrack('audio') as unknown as MediaStreamTrack }]);
    const subscribed = session.subscribe([{ userId: 'alice', trackName: 'audio', layer: null }]);

    await expect(published).rejects.toThrow('relay down');
    await subscribed;
    expect(order).toEqual(['publish', 'subscribe']);
  });

  it('replaceTrack_shouldSwapWhatAPublishedTrackSends', async () => {
    await session.publish([{ name: 'camera', track: new FakeTrack('video') as unknown as MediaStreamTrack }]);
    const back = new FakeTrack('video') as unknown as MediaStreamTrack;

    await session.replaceTrack('camera', back);
    await session.replaceTrack('screen', back);

    expect(peer.transceivers[0].sender.replaceTrack).toHaveBeenCalledWith(back);
  });

  it('forget_shouldStopNamingTheTracksOfSomeoneWhoLeft', async () => {
    signaling.subscribe.mockResolvedValue({ offer: null, requiresRenegotiation: false,
      tracks: [{ mid: '5', userId: 'alice', trackName: 'audio' }] });
    const arrived = vi.fn();
    session.onRemoteTrack = arrived;
    await session.subscribe([{ userId: 'alice', trackName: 'audio', layer: null }]);

    session.forget(['5']);
    peer.deliver('5', new FakeTrack('audio'));

    expect(arrived).not.toHaveBeenCalled();
  });

  it('onConnectionState_shouldFollowThePeer_andCloseShouldStopListening', () => {
    const states: string[] = [];
    session.onConnectionState = state => states.push(state);

    peer.changeState('connected');
    session.close();

    expect(states).toEqual(['connected']);
    expect(peer.close).toHaveBeenCalled();
    expect(peer.ontrack).toBeNull();
  });
});
