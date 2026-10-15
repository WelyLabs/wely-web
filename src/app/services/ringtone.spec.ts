import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Ringtone } from './ringtone';

describe('Ringtone', () => {
  let context: { state: string; currentTime: number; destination: object; resume: ReturnType<typeof vi.fn>;
    createOscillator: ReturnType<typeof vi.fn>; createGain: ReturnType<typeof vi.fn> };
  let vibrate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const node = () => ({
      type: '', frequency: { setValueAtTime: vi.fn() },
      gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn().mockImplementation(next => next), start: vi.fn(), stop: vi.fn(),
    });
    context = {
      state: 'running', currentTime: 0, destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      createOscillator: vi.fn().mockImplementation(node),
      createGain: vi.fn().mockImplementation(node),
    };
  });

  afterEach(() => vi.useRealTimers());

  it('start_shouldPlayTheSquareWaveMelody_andBuzz_inALoop', () => {
    const ringtone = new Ringtone(() => context as unknown as AudioContext);

    ringtone.start();
    const notesPerPhrase = context.createOscillator.mock.calls.length;
    vi.advanceTimersByTime(5000);

    expect(ringtone.playing).toBe(true);
    expect(notesPerPhrase).toBeGreaterThan(8);
    expect(context.createOscillator.mock.results[0].value.type).toBe('square');
    expect(context.createOscillator.mock.calls.length).toBeGreaterThan(notesPerPhrase);
    expect(vibrate).toHaveBeenCalledWith([300, 200, 300]);
    ringtone.stop();
  });

  it('start_shouldOnlyBuzz_whileTheBrowserKeepsAudioSuspended', () => {
    context.state = 'suspended';
    const ringtone = new Ringtone(() => context as unknown as AudioContext);

    ringtone.start();

    expect(context.resume).toHaveBeenCalled();
    expect(context.createOscillator).not.toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalled();
    ringtone.stop();
  });

  it('start_shouldNotStartTwice', () => {
    const ringtone = new Ringtone(() => context as unknown as AudioContext);
    ringtone.start();
    const notes = context.createOscillator.mock.calls.length;

    ringtone.start();

    expect(context.createOscillator.mock.calls.length).toBe(notes);
    ringtone.stop();
  });

  it('stop_shouldSilenceTheLoop_andTheBuzz', () => {
    const ringtone = new Ringtone(() => context as unknown as AudioContext);
    ringtone.start();
    const notes = context.createOscillator.mock.calls.length;

    ringtone.stop();
    vi.advanceTimersByTime(10_000);

    expect(ringtone.playing).toBe(false);
    expect(context.createOscillator.mock.calls.length).toBe(notes);
    expect(vibrate).toHaveBeenLastCalledWith(0);
  });

  it('start_shouldStillBuzz_withoutWebAudio', () => {
    const ringtone = new Ringtone(() => undefined);

    ringtone.start();

    expect(vibrate).toHaveBeenCalled();
    ringtone.stop();
  });
});
