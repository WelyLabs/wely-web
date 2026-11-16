import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SignInRefusedComponent } from './sign-in-refused';
import { RELOAD_WITHOUT_AUTH_RESPONSE } from '../startup-error/startup-error';

describe('SignInRefusedComponent', () => {
  let fixture: ComponentFixture<SignInRefusedComponent>;
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reload = vi.fn();
    TestBed.configureTestingModule({
      imports: [SignInRefusedComponent],
      providers: [{ provide: RELOAD_WITHOUT_AUTH_RESPONSE, useValue: reload }]
    });
    fixture = TestBed.createComponent(SignInRefusedComponent);
    fixture.componentRef.setInput('reason', 'Confirmez votre adresse e-mail avant de vous connecter.');
    fixture.detectChanges();
  });

  const el = () => fixture.nativeElement as HTMLElement;

  it('shouldShowAuth0Reason_ratherThanAnOutageMessage', () => {
    expect(el().textContent).toContain('Confirmez votre adresse e-mail');
    // Nothing broke, so the screen must not blame the service.
    expect(el().textContent).not.toContain('n\'a pas répondu');
  });

  it('shouldAnnounceItself_toAScreenReader', () => {
    expect(el().querySelector('[role="alert"]')).toBeTruthy();
  });

  it('retry_shouldComeBackToACleanPage_withoutSigningInAgain', () => {
    el().querySelector<HTMLButtonElement>('button')!.click();

    // An immediate sign-in would be refused for the same reason.
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
