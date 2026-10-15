import { Directive, ElementRef, effect, inject, input } from '@angular/core';

/**
 * Plays a MediaStream in a video or audio element. A stream cannot go through a template binding:
 * it is set on the element's `srcObject` property, and playback started once it is there.
 */
@Directive({ selector: 'video[appMediaStream], audio[appMediaStream]' })
export class MediaStreamDirective {
  readonly appMediaStream = input<MediaStream | null>(null);

  constructor() {
    const element = inject<ElementRef<HTMLMediaElement>>(ElementRef).nativeElement;
    effect(() => {
      const stream = this.appMediaStream();
      if (element.srcObject !== stream) {
        element.srcObject = stream;
      }
      // Autoplay can be refused before any tap; joining a call is one, so this rarely fails.
      void element.play?.()?.catch(() => undefined);
    });
  }
}
