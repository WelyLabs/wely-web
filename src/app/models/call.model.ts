/** Audio and video calls, as wely-chat describes them. */

export type CallMedia = 'AUDIO' | 'VIDEO';
export type CallStatus = 'RINGING' | 'ACTIVE' | 'ENDED' | 'MISSED' | 'DECLINED';
export type CallEventType = 'RINGING' | 'PARTICIPANT_JOINED' | 'PARTICIPANT_LEFT' | 'TRACKS_PUBLISHED' | 'DECLINED' | 'ENDED';
/** Simulcast layers of a camera: full, half and quarter resolution. */
export type VideoLayer = 'FULL' | 'HALF' | 'QUARTER';

/** The tracks the app publishes, by name. */
export const AUDIO_TRACK = 'audio';
export const CAMERA_TRACK = 'camera';

export interface CallParticipant {
  userId: string;
  joinedAt: string;
  trackNames: string[];
}

export interface Call {
  id: string;
  conversationId: string;
  startedBy: string;
  media: CallMedia;
  status: CallStatus;
  startedAt: string;
  endedAt: string | null;
  /** Who it rings and who may join. */
  memberIds: string[];
  /** Who is in it right now. */
  participants: CallParticipant[];
}

/** A frame of `call.events`. */
export interface CallEvent {
  type: CallEventType;
  actorId: string;
  call: Call;
}

export interface CallJoin {
  call: Call;
  iceServers: RTCIceServer[];
}

export interface SessionDescription {
  type: 'offer' | 'answer';
  sdp: string;
}

/** A track published on the transceiver `mid`. */
export interface PublishedTrack {
  mid: string;
  trackName: string;
}

/** A track to receive, named by who publishes it. */
export interface TrackRequest {
  userId: string;
  trackName: string;
  layer: VideoLayer | null;
}

/** A received track and the transceiver it arrives on. */
export interface ReceivedTrack {
  mid: string;
  userId: string;
  trackName: string;
}

export interface CallSubscription {
  offer: SessionDescription | null;
  requiresRenegotiation: boolean;
  tracks: ReceivedTrack[];
}

export interface LayerChoice {
  mid: string;
  userId: string;
  trackName: string;
  layer: VideoLayer;
}

export function isLive(call: Call | null | undefined): boolean {
  return call?.status === 'RINGING' || call?.status === 'ACTIVE';
}
