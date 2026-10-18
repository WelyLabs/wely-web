import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClosenessCelebrationComponent } from './closeness-celebration';
import { CelebrationService } from '../../services/celebration.service';

describe('ClosenessCelebrationComponent', () => {
    let fixture: ComponentFixture<ClosenessCelebrationComponent>;
    let celebrations: CelebrationService;
    const text = () => fixture.nativeElement.textContent as string;

    beforeEach(async () => {
        vi.useFakeTimers();
        await TestBed.configureTestingModule({ imports: [ClosenessCelebrationComponent] }).compileComponents();
        celebrations = TestBed.inject(CelebrationService);
        fixture = TestBed.createComponent(ClosenessCelebrationComponent);
        fixture.detectChanges();
    });

    afterEach(() => vi.useRealTimers());

    it('template_shouldShowNothing_untilAnUpgradeIsAccepted', () => {
        expect(fixture.nativeElement.querySelector('.celebration')).toBeNull();
    });

    it('template_shouldShowTheHearts_forAnIntimateFriend', () => {
        celebrations.celebrateCloseness('Léa', 'INTIMATE');
        fixture.detectChanges();

        expect(text()).toContain('Léa et toi êtes maintenant intimes');
        expect(text()).toContain('Votre lien passe au niveau supérieur.');
        expect(fixture.nativeElement.querySelector('.celebration').getAttribute('data-closeness')).toBe('INTIMATE');
    });

    it('template_shouldSayClose_forACloseFriend', () => {
        celebrations.celebrateCloseness('Hugo', 'CLOSE');
        fixture.detectChanges();

        expect(text()).toContain('Hugo et toi êtes maintenant proches');
        expect(text()).toContain('Vous partagez désormais un peu plus.');
    });

    it('dismiss_shouldCloseTheCard_whenPressed', () => {
        celebrations.celebrateCloseness('Léa', 'INTIMATE');
        fixture.detectChanges();

        fixture.nativeElement.querySelector('button').click();
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('.celebration')).toBeNull();
    });
});
