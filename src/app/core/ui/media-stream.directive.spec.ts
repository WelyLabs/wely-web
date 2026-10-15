import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { MediaStreamDirective } from './media-stream.directive';

@Component({
  imports: [MediaStreamDirective],
  template: '<video [appMediaStream]="stream()"></video>',
})
class HostComponent {
  readonly stream = signal<MediaStream | null>(null);
}

describe('MediaStreamDirective', () => {
  it('appMediaStream_shouldSetTheStreamAsSourceObject_andPlay', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const fixture = TestBed.createComponent(HostComponent);
    const stream = { id: 'stream-1' } as unknown as MediaStream;

    fixture.componentInstance.stream.set(stream);
    fixture.detectChanges();

    const video: HTMLVideoElement = fixture.nativeElement.querySelector('video');
    expect(video.srcObject).toBe(stream);
    expect(play).toHaveBeenCalled();
    play.mockRestore();
  });
});
