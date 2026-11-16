import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { MAX_NAME_LENGTH, SIGNUP_STEPS, SignupCompletionComponent, needsSignupCompletion, pendingSignupSteps } from './signup-completion';
import { UserService } from '../../services/user.service';
import { User } from '../../models/user.model';
import { LoggerService } from '../../core/logging/logger.service';

const profile = (fields: Partial<User>): User => ({ firstName: 'Léa', lastName: 'Martin', birthDate: '1995-03-12', ...fields } as User);

describe('pendingSignupSteps', () => {
    it('pendingSignupSteps_shouldListEveryStep_forAProfileProvisionedWithoutNames', () => {
        expect(pendingSignupSteps(profile({ firstName: '', lastName: '', birthDate: null })).map(step => step.id))
            .toEqual(['names', 'birthDate']);
    });

    it('pendingSignupSteps_shouldAskTheNames_whenOnlyOneIsBlank', () => {
        expect(pendingSignupSteps(profile({ lastName: '  ' })).map(step => step.id)).toEqual(['names']);
        expect(pendingSignupSteps(profile({ firstName: undefined })).map(step => step.id)).toEqual(['names']);
    });

    it('pendingSignupSteps_shouldAskOnlyTheBirthDate_whenTheNamesAreThere', () => {
        expect(pendingSignupSteps(profile({ birthDate: null })).map(step => step.id)).toEqual(['birthDate']);
    });

    it('pendingSignupSteps_shouldBeEmpty_forAFullProfileOrNoUser', () => {
        expect(pendingSignupSteps(profile({}))).toEqual([]);
        expect(pendingSignupSteps(null)).toEqual([]);
    });
});

describe('needsSignupCompletion', () => {
    it('needsSignupCompletion_shouldFollowTheMissingFields_notTheServerFlag', () => {
        // A step added after the signup reopens it for those who never filled the field.
        expect(needsSignupCompletion(profile({ birthDate: null, registrationCompleted: true }))).toBe(true);
        expect(needsSignupCompletion(profile({ registrationCompleted: false }))).toBe(false);
        expect(needsSignupCompletion(profile({}))).toBe(false);
        expect(needsSignupCompletion(null)).toBe(false);
    });
});

describe('SignupCompletionComponent', () => {
    let fixture: ComponentFixture<SignupCompletionComponent>;
    let component: SignupCompletionComponent;
    let completeRegistration: ReturnType<typeof vi.fn>;
    let logger: { error: ReturnType<typeof vi.fn> };

    const create = (user: User) => {
        fixture = TestBed.createComponent(SignupCompletionComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('user', user);
        fixture.detectChanges();
    };

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
        create(profile({ firstName: '', lastName: '', birthDate: null }));
    });

    const field = (id: string) => fixture.nativeElement.querySelector(`#${id}`) as HTMLInputElement;

    const type = (id: string, value: string) => {
        const input = field(id);
        input.value = value;
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
    };

    const next = () => {
        component.next();
        fixture.detectChanges();
    };

    const toBirthDate = () => {
        type('signup-first-name', 'Léa');
        type('signup-last-name', 'Martin');
        next();
    };

    it('template_shouldAskTheNamesFirst_thenTheBirthDate', () => {
        const el: HTMLElement = fixture.nativeElement;

        expect(SIGNUP_STEPS.map(step => step.id)).toEqual(['names', 'birthDate']);
        expect(el.textContent).toContain('Finalise ton inscription');
        expect(el.textContent).toContain('Bienvenue !');
        expect(el.textContent).toContain('Encore quelques détails');
        expect(el.querySelector('legend')?.textContent).toContain('Ton prénom et ton nom');
        expect(el.querySelector('label[for="signup-first-name"]')?.textContent).toContain('Prénom');
        expect(el.querySelector('label[for="signup-last-name"]')?.textContent).toContain('Nom');
        expect(el.querySelector('li[aria-current="step"]')?.textContent).toContain('Ton prénom et ton nom');
        expect(el.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
        // Nothing closes it but finishing.
        expect(el.querySelector('[aria-label="Fermer"]')).toBeNull();
    });

    it('template_shouldPrefillTheNameItHas_andGreet_whenOnlyOneNameIsMissing', () => {
        create(profile({ lastName: '', birthDate: null }));

        expect(field('signup-first-name').value).toBe('Léa');
        expect(field('signup-last-name').value).toBe('');
        expect(fixture.nativeElement.textContent).toContain('Bienvenue Léa');
    });

    it('template_shouldShowOnlyTheMissingStep_withoutAStepList', () => {
        create(profile({ birthDate: null }));
        const el: HTMLElement = fixture.nativeElement;

        expect(component.steps().map(step => step.id)).toEqual(['birthDate']);
        expect(el.querySelector('#signup-first-name')).toBeNull();
        expect(el.querySelector('#signup-birth-date')).not.toBeNull();
        expect(el.querySelector('.signup-steps')).toBeNull();
        expect(el.textContent).toContain('Encore un détail');
        expect(el.querySelector('button[type="submit"]')?.textContent).toContain('C\'est parti');
    });

    it('next_shouldSendOnlyTheBirthDate_whenItIsTheOnlyMissingStep', () => {
        create(profile({ birthDate: null }));
        type('signup-birth-date', '1995-03-12');

        next();

        expect(completeRegistration).toHaveBeenCalledWith({ birthDate: '1995-03-12' });
    });

    it('next_shouldSendOnlyTheNames_whenTheBirthDateIsAlreadyKnown', () => {
        create(profile({ firstName: '', lastName: '' }));
        type('signup-first-name', 'Léa');
        type('signup-last-name', ' Martin');

        next();

        expect(completeRegistration).toHaveBeenCalledWith({ firstName: 'Léa', lastName: 'Martin' });
    });

    it('steps_shouldStayAsOpened_whenTheUserChangesWhileTheCardIsOpen', () => {
        fixture.componentRef.setInput('user', profile({}));
        fixture.detectChanges();

        expect(component.steps().map(step => step.id)).toEqual(['names', 'birthDate']);
    });

    it('next_shouldRefuseMissingNames_andMarkTheFieldsInvalid', () => {
        next();

        expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Indique ton prénom.');
        expect(field('signup-first-name').getAttribute('aria-invalid')).toBe('true');
        expect(field('signup-last-name').getAttribute('aria-invalid')).toBe('true');

        type('signup-first-name', '  Léa ');
        type('signup-last-name', '   ');
        next();

        expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Indique ton nom.');
        expect(field('signup-first-name').getAttribute('aria-invalid')).toBe('false');
        expect(component.step().id).toBe('names');
    });

    it('next_shouldRefuseANameLongerThanTheServerAccepts', () => {
        component.givenFirstName.set('a'.repeat(MAX_NAME_LENGTH + 1));
        component.givenLastName.set('Martin');
        next();

        expect(fixture.nativeElement.textContent).toContain(`ne peut pas dépasser ${MAX_NAME_LENGTH} caractères`);
        expect(component.step().id).toBe('names');
    });

    it('next_shouldGoToTheBirthDate_withoutShowingItsErrorYet', () => {
        toBirthDate();

        expect(component.step().id).toBe('birthDate');
        expect(field('signup-birth-date')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    });

    it('next_shouldRefuseAnEmptyOrTooRecentDate_withoutCallingTheServer', () => {
        toBirthDate();
        next();
        expect(fixture.nativeElement.textContent).toContain('Indique ta date de naissance.');

        const recent = new Date();
        type('signup-birth-date', `${recent.getFullYear() - 5}-01-01`);
        next();

        expect(fixture.nativeElement.textContent).toContain('au moins 13 ans');
        expect(completeRegistration).not.toHaveBeenCalled();
    });

    it('next_shouldCompleteTheRegistration_withTheTrimmedNamesAndTheBirthDate', () => {
        type('signup-first-name', ' Léa ');
        type('signup-last-name', 'Martin ');
        fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
        fixture.detectChanges();
        type('signup-birth-date', '1995-03-12');

        fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));

        expect(completeRegistration).toHaveBeenCalledWith({ firstName: 'Léa', lastName: 'Martin', birthDate: '1995-03-12' });
        expect(component.saving()).toBe(false);
        expect(component.saveError()).toBeNull();
    });

    it('next_shouldSayItFailed_andStayOpen_whenTheServerRefuses', () => {
        completeRegistration.mockReturnValue(throwError(() => new Error('down')));
        toBirthDate();
        type('signup-birth-date', '1995-03-12');

        next();

        expect(component.saveError()).toContain('n\'a pas pu être finalisée');
        expect(logger.error).toHaveBeenCalled();
        expect(component.saving()).toBe(false);
    });
});
