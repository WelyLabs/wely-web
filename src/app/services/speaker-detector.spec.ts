import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SpeakerDetector, layerFor } from './speaker-detector';
import { FakeMediaStream, FakeTrack } from '../../testing/webrtc.stub';

describe('layerFor', () => {
  it('layerFor_shouldSendFullResolution_toATwoPersonCall_andToTheSpeaker', () => {
    expect(layerFor(1, false)).toBe('FULL');
    expect(layerFor(6, true)).toBe('FULL');
  });

  it('layerFor_shouldShrinkTheOthers_asTheGridFillsUp', () => {
    expect(layerFor(3, false)).toBe('HALF');
    expect(layerFor(4, false)).toBe('QUARTER');
  });
});

describe('SpeakerDetector', () => {
  const levels = new Map<string, number>();
  let context: { createMediaStreamSource: ReturnType<typeof vi.fn>; createAnalyser: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('MediaStream', FakeMediaStream);
    let watching = '';
    context = {
      createMediaStreamSource: vi.fn().mockImplementation((stream: FakeMediaStream) => {
        watching = stream.getTracks()[0].id;
        return { connect: vi.fn(), disconnect: vi.fn() };
      }),
      createAnalyser: vi.fn().mockImplementation(() => {
        const trackId = watching;
        return {
          fftSize: 512,
          getFloatTimeDomainData: (samples: Float32Array) => samples.fill(levels.get(trackId) ?? 0),
        };
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    levels.clear();
  });

  it('sample_shouldNameTheLoudest_andKeepThemThroughSilence', () => {
    const speakers: (string | null)[] = [];
    const detector = new SpeakerDetector(id => speakers.push(id), () => context as unknown as AudioContext);
    detector.watch('alice', new FakeTrack('audio', 'a') as unknown as MediaStreamTrack);
    detector.watch('bob', new FakeTrack('audio', 'b') as unknown as MediaStreamTrack);

    levels.set('a', 0.01);
    levels.set('b', 0.2);
    vi.advanceTimersByTime(300);
    levels.set('a', 0.3);
    vi.advanceTimersByTime(300);
    levels.clear();
    vi.advanceTimersByTime(900);

    expect(speakers).toEqual(['bob', 'alice']);
    detector.stop();
  });

  it('unwatch_shouldStopListeningToSomeoneWhoLeft', () => {
    const speakers: (string | null)[] = [];
    const detector = new SpeakerDetector(id => speakers.push(id), () => context as unknown as AudioContext);
    detector.watch('alice', new FakeTrack('audio', 'a') as unknown as MediaStreamTrack);

    detector.unwatch('alice');
    levels.set('a', 0.5);
    vi.advanceTimersByTime(600);

    expect(speakers).toEqual([]);
    detector.stop();
    expect(context.close).toHaveBeenCalled();
  });

  it('watch_shouldDoNothing_withoutWebAudio', () => {
    const detector = new SpeakerDetector(() => undefined, () => undefined);

    detector.watch('alice', new FakeTrack('audio') as unknown as MediaStreamTrack);

    detector.stop();
  });
});
