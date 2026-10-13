import { Directive, input } from '@angular/core';

/**
 * While the bound value is true, a light runs around the element's border in the brand colours,
 * for as long as a request is pending. The look lives in styles.scss (`.pending-trail`).
 */
@Directive({
    selector: '[appPendingTrail]',
    host: {
        '[class.pending-trail]': 'appPendingTrail()',
        // Screen readers announce the wait that the animation shows.
        '[attr.aria-busy]': 'appPendingTrail() || null'
    }
})
export class PendingTrailDirective {
    readonly appPendingTrail = input(false);
}
