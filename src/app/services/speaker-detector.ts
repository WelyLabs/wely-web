import { VideoLayer } from '../models/call.model';

/** Below this level (0 to 1), nobody is speaking. */
const SPEAKING_LEVEL = 0.02;
const SAMPLE_MS = 300;

/**
 * Who is speaking, from the received audio: whoever is loudest above a floor. It decides who gets
 * the large tile, and the full-resolution camera.
 */
export class SpeakerDetector {
  private readonly analysers = new Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode }>();
  private context?: AudioContext;
  private loop?: ReturnType<typeof setInterval>;
  private current: string | null = null;

  constructor(
    private readonly onSpeaker: (userId: string | null) => void,
    private readonly createContext: () => AudioContext | undefined = () =>
      typeof AudioContext === 'undefined' ? undefined : new AudioContext(),
  ) {}

  watch(userId: string, track: MediaStreamTrack): void {
    this.context ??= this.createContext();
    if (!this.context) {
      return;
    }
    this.unwatch(userId);
    const source = this.context.createMediaStreamSource(new MediaStream([track]));
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    this.analysers.set(userId, { analyser, source });
    this.loop ??= setInterval(() => this.sample(), SAMPLE_MS);
  }

  unwatch(userId: string): void {
    const entry = this.analysers.get(userId);
    entry?.source.disconnect();
    this.analysers.delete(userId);
  }

  stop(): void {
    clearInterval(this.loop);
    this.loop = undefined;
    [...this.analysers.keys()].forEach(userId => this.unwatch(userId));
    void this.context?.close().catch(() => undefined);
    this.context = undefined;
  }

  private sample(): void {
    let loudest: string | null = null;
    let loudestLevel = SPEAKING_LEVEL;
    this.analysers.forEach(({ analyser }, userId) => {
      const level = rms(analyser);
      if (level > loudestLevel) {
        loudest = userId;
        loudestLevel = level;
      }
    });
    // Silence keeps the last speaker on screen rather than flickering away.
    if (loudest && loudest !== this.current) {
      this.current = loudest;
      this.onSpeaker(loudest);
    }
  }
}

function rms(analyser: AnalyserNode): number {
  const samples = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Which camera layer to receive: full resolution for one other person or for whoever speaks,
 * smaller as the grid fills up.
 */
export function layerFor(othersInCall: number, isSpeaker: boolean): VideoLayer {
  if (othersInCall <= 1 || isSpeaker) {
    return 'FULL';
  }
  return othersInCall <= 3 ? 'HALF' : 'QUARTER';
}
