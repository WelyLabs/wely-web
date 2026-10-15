import { DestroyRef, Injectable, Signal, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, Subject, firstValueFrom, map } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AUDIO_TRACK,
  CAMERA_TRACK,
  Call,
  CallEvent,
  CallJoin,
  CallMedia,
  CallSubscription,
  LayerChoice,
  PublishedTrack,
  SessionDescription,
  TrackRequest,
} from '../models/call.model';
import { ChatService } from './chat.service';
import { UserService } from './user.service';
import { SocialService } from './social.service';
import { NotificationService } from './notification.service';
import { LoggerService } from '../core/logging/logger.service';
import { CallSession, CallSignaling, LocalPublication, RemoteTrackEvent } from './call-session';
import { Ringtone } from './ringtone';
import { SpeakerDetector, layerFor } from './speaker-detector';

const SCOPE = 'CallService';
/** As wely-chat expects: three missed heartbeats and a participant is dropped. */
const HEARTBEAT_MS = 15_000;

export type CallConnection = 'idle' | 'connecting' | 'connected' | 'failed';

/** Someone else in the call, with what arrives from them. */
export interface RemoteParticipant {
  userId: string;
  stream: MediaStream;
  hasVideo: boolean;
}

const AUDIO_CONSTRAINTS: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const VIDEO_CONSTRAINTS = (facingMode: 'user' | 'environment'): MediaTrackConstraints =>
  ({ facingMode, width: { ideal: 1280 }, height: { ideal: 720 } });

/**
 * Audio and video calls, from ringing to hanging up.
 *
 * <p>wely-chat decides who may do what and holds the relay's secret; this service asks it for
 * each step, and runs the browser's side: the microphone and camera, the one WebRTC connection
 * to the relay ({@link CallSession}), the heartbeat that keeps the user in the call, and the
 * ringtone. What the screens need is exposed as signals.
 */
@Injectable({ providedIn: 'root' })
export class CallService {
  private readonly http = inject(HttpClient);
  private readonly chat = inject(ChatService);
  private readonly users = inject(UserService);
  private readonly social = inject(SocialService);
  private readonly notifications = inject(NotificationService);
  private readonly logger = inject(LoggerService);

  private readonly apiUrl = `${environment.apiUrl}/chat-service/calls`;

  /** A call ringing for the user, until they answer, decline or it stops. */
  readonly incoming = signal<Call | null>(null);
  /** The call the user is in. */
  readonly call = signal<Call | null>(null);
  readonly connection = signal<CallConnection>('idle');
  readonly localStream = signal<MediaStream | null>(null);
  readonly muted = signal(false);
  readonly cameraOn = signal(false);
  readonly speakerId = signal<string | null>(null);
  private readonly remoteStreams = signal<ReadonlyMap<string, MediaStream>>(new Map());

  /** Everyone else in the call, the speaker first. */
  readonly participants = computed<RemoteParticipant[]>(() => {
    const me = this.users.getCurrentUserValue()?.id;
    const streams = this.remoteStreams();
    const speaker = this.speakerId();
    return (this.call()?.participants ?? [])
      .filter(participant => participant.userId !== me)
      .map(participant => {
        const stream = streams.get(participant.userId) ?? new MediaStream();
        return { userId: participant.userId, stream, hasVideo: stream.getVideoTracks().length > 0 };
      })
      .sort((a, b) => Number(b.userId === speaker) - Number(a.userId === speaker));
  });

  /** Call events, for screens that show whether a conversation has a call going on. */
  readonly events$: Observable<CallEvent>;
  private readonly events = new Subject<CallEvent>();

  private session?: CallSession;
  private heartbeat?: ReturnType<typeof setInterval>;
  private detector?: SpeakerDetector;
  private facingMode: 'user' | 'environment' = 'user';
  /** `userId:trackName` to the mid it arrives on. */
  private readonly subscribed = new Map<string, string>();
  private readonly ringtone = new Ringtone();
  private readonly names = new Map<string, Signal<string | null>>();
  private listening = false;

  constructor() {
    this.events$ = this.events.asObservable();
    inject(DestroyRef).onDestroy(() => this.teardown());
  }

  /** Starts listening for calls; the app shell calls it once the user is signed in. */
  listen(): void {
    if (this.listening) {
      return;
    }
    this.listening = true;
    this.chat.openStream<CallEvent>('call.events').subscribe({
      next: event => this.onEvent(event),
      error: error => this.logger.error(SCOPE, 'call events gave up', error),
    });
  }

  /** Calls a conversation's members, or joins the call already going on there. */
  async start(conversationId: string, media: CallMedia): Promise<Call | null> {
    try {
      const call = await firstValueFrom(this.http.post<Call>(this.apiUrl, { conversationId, media }));
      return await this.join(call.id, media);
    } catch (error) {
      this.explain(error);
      return null;
    }
  }

  /**
   * Enters a call: the server first, then the microphone (and camera), then the connection to the
   * relay. Media defaults to the call's own.
   */
  async join(callId: string, media?: CallMedia): Promise<Call | null> {
    if (this.call()?.id === callId) {
      return this.call();
    }
    if (this.call()) {
      await this.leave();
    }
    this.stopRinging();
    this.connection.set('connecting');
    try {
      const joined = await firstValueFrom(this.http.post<CallJoin>(`${this.apiUrl}/${callId}/join`, {}));
      const withVideo = (media ?? joined.call.media) === 'VIDEO';
      const local = await this.openMedia(withVideo).catch(async error => {
        await firstValueFrom(this.http.post<void>(`${this.apiUrl}/${callId}/leave`, {})).catch(() => undefined);
        throw error;
      });
      this.localStream.set(local);
      this.cameraOn.set(withVideo);
      this.muted.set(false);
      this.call.set(joined.call);
      this.connect(joined, local);
      return joined.call;
    } catch (error) {
      this.explain(error);
      this.teardown();
      return null;
    }
  }

  /** Refuses a ringing call. */
  decline(call: Call): void {
    this.stopRinging();
    this.http.post<void>(`${this.apiUrl}/${call.id}/decline`, {}).subscribe({
      error: error => this.logger.warn(SCOPE, 'decline failed', error),
    });
  }

  /** Hangs up. The server is told, but the call ends here whatever it answers. */
  async leave(): Promise<void> {
    const call = this.call();
    this.teardown();
    if (call) {
      await firstValueFrom(this.http.post<void>(`${this.apiUrl}/${call.id}/leave`, {}))
        .catch(error => this.logger.warn(SCOPE, 'leave failed', error));
    }
  }

  /** The live call of a conversation, or null; for a "Join" button. */
  liveCall(conversationId: string): Observable<Call | null> {
    const params = new HttpParams().set('conversationId', conversationId);
    return this.http.get<Call | null>(`${this.apiUrl}/live`, { params }).pipe(map(call => call ?? null));
  }

  toggleMute(): void {
    const muted = !this.muted();
    this.localStream()?.getAudioTracks().forEach(track => track.enabled = !muted);
    this.muted.set(muted);
  }

  /**
   * Turns the camera off or on. Off stops it, so its light goes out; on, in a call that started
   * without video, it is published for the first time.
   */
  async toggleCamera(): Promise<void> {
    const local = this.localStream();
    if (!local || !this.session) {
      return;
    }
    if (this.cameraOn()) {
      local.getVideoTracks().forEach(track => {
        track.stop();
        local.removeTrack(track);
      });
      await this.session.replaceTrack(CAMERA_TRACK, null);
      this.cameraOn.set(false);
      this.localStream.set(new MediaStream(local.getTracks()));
      return;
    }
    try {
      const camera = await this.cameraTrack();
      local.addTrack(camera);
      if (this.session.publishes(CAMERA_TRACK)) {
        await this.session.replaceTrack(CAMERA_TRACK, camera);
      } else {
        await this.session.publish([{ name: CAMERA_TRACK, track: camera, simulcast: true }]);
      }
      this.cameraOn.set(true);
      this.localStream.set(new MediaStream(local.getTracks()));
    } catch (error) {
      this.explain(error);
    }
  }

  /** Front to back camera and back, on phones. */
  async flipCamera(): Promise<void> {
    const local = this.localStream();
    const current = local?.getVideoTracks()[0];
    if (!local || !current || !this.session) {
      return;
    }
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    try {
      const flipped = await this.cameraTrack();
      await this.session.replaceTrack(CAMERA_TRACK, flipped);
      current.stop();
      local.removeTrack(current);
      local.addTrack(flipped);
      this.localStream.set(new MediaStream(local.getTracks()));
    } catch (error) {
      this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
      this.explain(error);
    }
  }

  /** Someone's name, for a tile or the ringing banner; null until known. */
  nameOf(userId: string): Signal<string | null> {
    let name = this.names.get(userId);
    if (!name) {
      const value = signal<string | null>(null);
      this.social.getPerson(userId).subscribe({
        next: person => value.set(person.userName),
        error: () => value.set('Quelqu’un'),
      });
      name = value.asReadonly();
      this.names.set(userId, name);
    }
    return name;
  }

  // --- events ------------------------------------------------------------------------------

  private onEvent(event: CallEvent): void {
    this.events.next(event);
    const inCall = this.call()?.id === event.call.id;
    switch (event.type) {
      case 'RINGING':
        if (!this.call()) {
          this.incoming.set(event.call);
          this.ringtone.start();
        }
        break;
      case 'ENDED':
        if (this.incoming()?.id === event.call.id) {
          this.stopRinging();
        }
        if (inCall) {
          this.teardown();
        }
        break;
      case 'PARTICIPANT_JOINED':
        if (inCall) {
          this.call.set(event.call);
        }
        break;
      case 'TRACKS_PUBLISHED':
        if (inCall) {
          this.call.set(event.call);
          void this.receiveFrom(event.call, event.actorId);
        }
        break;
      case 'PARTICIPANT_LEFT':
        if (inCall) {
          this.call.set(event.call);
          this.forget(event.actorId);
        }
        break;
      case 'DECLINED':
        break;
    }
  }

  // --- connection --------------------------------------------------------------------------

  private connect(joined: CallJoin, local: MediaStream): void {
    const callId = joined.call.id;
    const session = new CallSession(joined.iceServers, this.signaling(callId));
    this.session = session;
    session.onRemoteTrack = event => this.onRemoteTrack(event);
    session.onConnectionState = state => {
      if (state === 'connected') {
        this.connection.set('connected');
      } else if (state === 'failed') {
        this.connection.set('failed');
      }
    };
    this.detector = new SpeakerDetector(userId => this.onSpeaker(userId));
    this.heartbeat = setInterval(() => this.beat(callId), HEARTBEAT_MS);

    const publications: LocalPublication[] = local.getTracks().map(track => track.kind === 'audio'
      ? { name: AUDIO_TRACK, track }
      : { name: CAMERA_TRACK, track, simulcast: true });
    void session.publish(publications)
      .then(() => {
        const me = this.users.getCurrentUserValue()?.id;
        const call = this.call();
        return Promise.all((call?.participants ?? [])
          .filter(participant => participant.userId !== me)
          .map(participant => this.receiveFrom(call!, participant.userId)));
      })
      .catch(error => {
        this.logger.error(SCOPE, 'could not connect to the call', error);
        this.connection.set('failed');
      });
  }

  /** Subscribes to what someone publishes that is not received yet. */
  private async receiveFrom(call: Call, userId: string): Promise<void> {
    const session = this.session;
    const participant = call.participants.find(entry => entry.userId === userId);
    if (!session || !participant) {
      return;
    }
    const others = call.participants.length - 1;
    const requests: TrackRequest[] = participant.trackNames
      .filter(name => !this.subscribed.has(`${userId}:${name}`))
      .map(name => ({
        userId,
        trackName: name,
        layer: name === CAMERA_TRACK ? layerFor(others, userId === this.speakerId()) : null,
      }));
    requests.forEach(request => this.subscribed.set(`${request.userId}:${request.trackName}`, ''));
    try {
      const received = await session.subscribe(requests);
      received.forEach(track => this.subscribed.set(`${track.userId}:${track.trackName}`, track.mid));
    } catch (error) {
      requests.forEach(request => this.subscribed.delete(`${request.userId}:${request.trackName}`));
      this.logger.warn(SCOPE, 'could not receive a participant', error);
    }
  }

  private onRemoteTrack(event: RemoteTrackEvent): void {
    const streams = new Map(this.remoteStreams());
    const previous = streams.get(event.userId);
    const tracks = (previous?.getTracks() ?? []).filter(track => track.kind !== event.track.kind);
    streams.set(event.userId, new MediaStream([...tracks, event.track]));
    this.remoteStreams.set(streams);
    if (event.track.kind === 'audio') {
      this.detector?.watch(event.userId, event.track);
    }
  }

  /** Someone left: their tiles go, and the relay stops sending what came from them. */
  private forget(userId: string): void {
    const mids: string[] = [];
    [...this.subscribed.entries()]
      .filter(([key]) => key.startsWith(`${userId}:`))
      .forEach(([key, mid]) => {
        this.subscribed.delete(key);
        if (mid) {
          mids.push(mid);
        }
      });
    const streams = new Map(this.remoteStreams());
    streams.delete(userId);
    this.remoteStreams.set(streams);
    this.detector?.unwatch(userId);
    this.session?.forget(mids);
    const call = this.call();
    if (call && mids.length > 0) {
      this.http.post<void>(`${this.apiUrl}/${call.id}/unsubscribe`, { mids }).subscribe({
        error: error => this.logger.warn(SCOPE, 'unsubscribe failed', error),
      });
    }
  }

  /** The speaker gets the full camera, the others a smaller layer as the grid fills up. */
  private onSpeaker(userId: string | null): void {
    this.speakerId.set(userId);
    const call = this.call();
    if (!call || call.participants.length <= 2) {
      return;
    }
    const others = call.participants.length - 1;
    const choices: LayerChoice[] = [...this.subscribed.entries()]
      .filter(([key, mid]) => key.endsWith(`:${CAMERA_TRACK}`) && mid)
      .map(([key, mid]) => {
        const publisher = key.slice(0, key.lastIndexOf(':'));
        return { mid, userId: publisher, trackName: CAMERA_TRACK, layer: layerFor(others, publisher === userId) };
      });
    if (choices.length > 0) {
      this.http.put<void>(`${this.apiUrl}/${call.id}/layers`, { choices }).subscribe({
        error: error => this.logger.warn(SCOPE, 'layer switch failed', error),
      });
    }
  }

  private beat(callId: string): void {
    this.http.post<void>(`${this.apiUrl}/${callId}/heartbeat`, {}).subscribe({
      // 404: the call ended, or this user was dropped while offline.
      error: (error: HttpErrorResponse) => {
        if (error.status === 404 && this.call()?.id === callId) {
          this.teardown();
        }
      },
    });
  }

  private signaling(callId: string): CallSignaling {
    const url = `${this.apiUrl}/${callId}`;
    return {
      publish: (offer: SessionDescription, tracks: PublishedTrack[]) =>
        firstValueFrom(this.http.post<SessionDescription>(`${url}/publish`, { offer, tracks })),
      subscribe: (tracks: TrackRequest[]) =>
        firstValueFrom(this.http.post<CallSubscription>(`${url}/subscribe`, { tracks })),
      renegotiate: (answer: SessionDescription) =>
        firstValueFrom(this.http.put<void>(`${url}/renegotiate`, answer)).then(() => undefined),
    };
  }

  // --- media -------------------------------------------------------------------------------

  private async openMedia(withVideo: boolean): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: withVideo ? VIDEO_CONSTRAINTS(this.facingMode) : false,
    });
  }

  private async cameraTrack(): Promise<MediaStreamTrack> {
    const stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS(this.facingMode) });
    return stream.getVideoTracks()[0];
  }

  private stopRinging(): void {
    this.ringtone.stop();
    this.incoming.set(null);
  }

  /** Everything back to idle: no connection, no microphone light, no heartbeat. */
  private teardown(): void {
    clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    this.session?.close();
    this.session = undefined;
    this.detector?.stop();
    this.detector = undefined;
    this.localStream()?.getTracks().forEach(track => track.stop());
    this.localStream.set(null);
    this.remoteStreams.set(new Map());
    this.subscribed.clear();
    this.speakerId.set(null);
    this.cameraOn.set(false);
    this.muted.set(false);
    this.call.set(null);
    this.connection.set('idle');
  }

  /** Tells the user why a call could not start, in their words. */
  private explain(error: unknown): void {
    this.logger.warn(SCOPE, 'call step failed', error);
    if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
      this.notifications.showInfo('Autorise le micro (et la caméra) pour appeler.');
    } else if (error instanceof DOMException && error.name === 'NotFoundError') {
      this.notifications.showInfo('Aucun micro ou caméra trouvé sur cet appareil.');
    } else if (error instanceof HttpErrorResponse && error.error?.code === 'CHT-BUS-009') {
      this.notifications.showInfo('L’appel est complet.');
    } else if (error instanceof HttpErrorResponse && error.error?.code === 'CHT-BUS-008') {
      this.notifications.showInfo('Cet appel est terminé.');
    } else {
      this.notifications.showInfo('Les appels sont indisponibles pour le moment.');
    }
  }
}
