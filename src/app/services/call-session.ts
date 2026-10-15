import { PublishedTrack, ReceivedTrack, SessionDescription, CallSubscription, TrackRequest } from '../models/call.model';

/** How a session reaches the relay: through wely-chat, which holds the relay's secret. */
export interface CallSignaling {
  publish(offer: SessionDescription, tracks: PublishedTrack[]): Promise<SessionDescription>;
  subscribe(requests: TrackRequest[]): Promise<CallSubscription>;
  renegotiate(answer: SessionDescription): Promise<void>;
}

/** A local track to publish under a name; a camera goes out in three simulcast layers. */
export interface LocalPublication {
  name: string;
  track: MediaStreamTrack;
  simulcast?: boolean;
}

/** A remote track as it starts arriving. */
export interface RemoteTrackEvent extends ReceivedTrack {
  track: MediaStreamTrack;
}

/**
 * Full, half and quarter resolution: the relay forwards whichever layer each receiver asks for,
 * so a phone showing twelve thumbnails is not sent twelve HD streams. The rids are the ones
 * wely-chat asks the relay for.
 */
export const SIMULCAST_LAYERS: RTCRtpEncodingParameters[] = [
  { rid: 'f', scaleResolutionDownBy: 1, maxBitrate: 1_200_000 },
  { rid: 'h', scaleResolutionDownBy: 2, maxBitrate: 400_000 },
  { rid: 'q', scaleResolutionDownBy: 4, maxBitrate: 150_000 },
];

/**
 * One browser's WebRTC connection to the relay: it publishes its own tracks there and receives
 * everyone else's from it, on a single RTCPeerConnection.
 *
 * <p>Negotiations run one at a time. Publishing and subscribing both change the session
 * description, and two overlapping offer/answer exchanges would leave it in a state neither
 * side expects.
 */
export class CallSession {
  private readonly peer: RTCPeerConnection;
  private queue: Promise<unknown> = Promise.resolve();
  /** Who sends what arrives on each receiving transceiver. */
  private readonly receiving = new Map<string, ReceivedTrack>();
  private readonly senders = new Map<string, RTCRtpSender>();

  onRemoteTrack?: (event: RemoteTrackEvent) => void;
  onConnectionState?: (state: RTCPeerConnectionState) => void;

  constructor(
    iceServers: RTCIceServer[],
    private readonly signaling: CallSignaling,
    createPeer: (config: RTCConfiguration) => RTCPeerConnection = config => new RTCPeerConnection(config),
  ) {
    this.peer = createPeer({ iceServers, bundlePolicy: 'max-bundle' });
    this.peer.ontrack = event => {
      const mid = event.transceiver.mid;
      const owner = mid ? this.receiving.get(mid) : undefined;
      if (owner) {
        this.onRemoteTrack?.({ ...owner, track: event.track });
      }
    };
    this.peer.onconnectionstatechange = () => this.onConnectionState?.(this.peer.connectionState);
  }

  /** Sends tracks: the browser's offer goes to the relay, whose answer completes the exchange. */
  publish(publications: LocalPublication[]): Promise<void> {
    return this.serialized(async () => {
      const added = publications.map(publication => {
        const transceiver = this.peer.addTransceiver(publication.track, {
          direction: 'sendonly',
          sendEncodings: publication.simulcast ? SIMULCAST_LAYERS : undefined,
        });
        this.senders.set(publication.name, transceiver.sender);
        return { transceiver, name: publication.name };
      });
      const offer = await this.peer.createOffer();
      await this.peer.setLocalDescription(offer);
      // A transceiver only gets its mid once the offer is set locally.
      const answer = await this.signaling.publish(
        { type: 'offer', sdp: offer.sdp ?? '' },
        added.map(({ transceiver, name }) => ({ mid: transceiver.mid ?? '', trackName: name })),
      );
      await this.peer.setRemoteDescription(answer);
    });
  }

  /**
   * Receives tracks. The relay answers with the transceivers they will arrive on, and usually
   * with an offer of its own, which the browser answers before any media flows.
   */
  subscribe(requests: TrackRequest[]): Promise<ReceivedTrack[]> {
    if (requests.length === 0) {
      return Promise.resolve([]);
    }
    return this.serialized(async () => {
      const subscription = await this.signaling.subscribe(requests);
      // Known before the offer is applied: ontrack fires while it is.
      subscription.tracks.forEach(track => this.receiving.set(track.mid, track));
      if (subscription.requiresRenegotiation && subscription.offer) {
        await this.peer.setRemoteDescription(subscription.offer);
        const answer = await this.peer.createAnswer();
        await this.peer.setLocalDescription(answer);
        await this.signaling.renegotiate({ type: 'answer', sdp: answer.sdp ?? '' });
      }
      return subscription.tracks;
    });
  }

  /** Swaps what a published track sends, such as the other camera, without renegotiating. */
  replaceTrack(name: string, track: MediaStreamTrack | null): Promise<void> {
    return this.senders.get(name)?.replaceTrack(track) ?? Promise.resolve();
  }

  publishes(name: string): boolean {
    return this.senders.has(name);
  }

  /** Forgets the transceivers of someone who left. */
  forget(mids: string[]): void {
    mids.forEach(mid => this.receiving.delete(mid));
  }

  close(): void {
    this.peer.ontrack = null;
    this.peer.onconnectionstatechange = null;
    this.peer.close();
  }

  private serialized<T>(step: () => Promise<T>): Promise<T> {
    const run = this.queue.then(step, step);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
