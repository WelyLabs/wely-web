import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { SIGNUP_STEPS, SignupCompletionComponent, needsSignupCompletion } from './signup-completion';
import { UserService } from '../../services/user.service';
import { User } from '../../models/user.model';
import { LoggerService } from '../../core/logging/logger.service';

describe('needsSignupCompletion', () => {
    it('needsSignupCompletion_shouldOnlyBlock_whenTheServerSaysIncomplete', () => {
        expect(needsSignupCompletion({ registrationCompleted: false } as User)).toBe(true);
        expect(needsSignupCompletion({ registrationCompleted: true } as User)).toBe(false);
        // A profile from before the field existed, or none loaded yet: nothing to block on.
        expect(needsSignupCompletion({} as User)).toBe(false);
        expect(needsSignupCompletion(null)).toBe(false);
    });
});

describe('SignupCompletionComponent', () => {
    let fixture: ComponentFixture<SignupCompletionComponent>;
    let component: SignupCompletionComponent;
    let completeRegistration: ReturnType<typeof vi.fn>;
    let logger: { error: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        completeRegistration = vi.fn().mockReturnValue(of({}));
        logger = { error: vi.fn() };
        TestBed.configureTestingModule({
            imports: [SignupCompletionComponent],
            providers: [
                { provide: UserService, useValue: { completeRegistration } },
                { provide: LoggerService, useValue: logger }
            ]
        });
        fixture = TestBed.createComponent(SignupCompletionComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('firstName', 'Léa');
        fixture.detectChanges();
    });

    const type = (value: string) => {
        const input = fixture.nativeElement.querySelector('#signup-birth-date') as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
    };

    it('template_shouldAskTheBirthDate_andSayFriendsNeverSeeTheYear', () => {
        const el: HTMLElement = fixture.nativeElement;

        expect(SIGNUP_STEPS.map(step => step.id)).toEqual(['birthDate']);
        expect(el.textContent).toContain('Finalise ton inscription');
        expect(el.textContent).toContain('Bienvenue Léa');
        expect(el.textContent).toContain('Tes amis verront le jour et le mois, jamais ton année.');
        expect(el.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
        // Nothing closes it but finishing.
        expect(el.querySelector('[aria-label="Fermer"]')).toBeNull();
    });

    it('next_shouldRefuseAnEmptyOrTooRecentDate_withoutCallingTheServer', () => {
        component.next();
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Indique ta date de naissance.');

        const recent = new Date();
        type(`${recent.getFullYear() - 5}-01-01`);
        component.next();
        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain('au moins 13 ans');
        expect(completeRegistration).not.toHaveBeenCalled();
    });

    it('next_shouldCompleteTheRegistration_withTheBirthDate', () => {
        type('1995-03-12');

        fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));

        expect(completeRegistration).toHaveBeenCalledWith({ birthDate: '1995-03-12' });
        expect(component.saving()).toBe(false);
        expect(component.saveError()).toBeNull();
    });

    it('next_shouldSayItFailed_andStayOpen_whenTheServerRefuses', () => {
        completeRegistration.mockReturnValue(throwError(() => new Error('down')));
        type('1995-03-12');

        component.next();
        fixture.detectChanges();

        expect(component.saveError()).toContain('n\'a pas pu être finalisée');
        expect(logger.error).toHaveBeenCalled();
        expect(component.saving()).toBe(false);
    });
});
