import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { PendingTrailDirective } from './pending-trail.directive';

@Component({
    imports: [PendingTrailDirective],
    template: `<button [appPendingTrail]="pending()">Envoyer</button>`,
    changeDetection: ChangeDetectionStrategy.OnPush
})
class HostComponent {
    readonly pending = signal(false);
}

describe('PendingTrailDirective', () => {
    let host: HostComponent;
    let button: HTMLButtonElement;
    let detectChanges: () => void;

    beforeEach(() => {
        const fixture = TestBed.createComponent(HostComponent);
        host = fixture.componentInstance;
        detectChanges = () => fixture.detectChanges();
        detectChanges();
        button = fixture.nativeElement.querySelector('button');
    });

    it('appPendingTrail_shouldShowTheTrailAndMarkBusy_whileTrue', () => {
        host.pending.set(true);
        detectChanges();

        expect(button.classList).toContain('pending-trail');
        expect(button.getAttribute('aria-busy')).toBe('true');
    });

    it('appPendingTrail_shouldLeaveNoTrace_whenFalse', () => {
        host.pending.set(true);
        detectChanges();
        host.pending.set(false);
        detectChanges();

        expect(button.classList).not.toContain('pending-trail');
        expect(button.hasAttribute('aria-busy')).toBe(false);
    });
});
