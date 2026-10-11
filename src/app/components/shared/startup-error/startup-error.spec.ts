import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { StartupErrorComponent, RELOAD_WITHOUT_AUTH_RESPONSE } from './startup-error';

describe('StartupErrorComponent', () => {
  it('should explain the failure and reload without the OAuth response on retry', () => {
    const reload = vi.fn();
    TestBed.configureTestingModule({
      imports: [StartupErrorComponent],
      providers: [{ provide: RELOAD_WITHOUT_AUTH_RESPONSE, useValue: reload }]
    });
    const fixture = TestBed.createComponent(StartupErrorComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('[role="alert"]')?.textContent).toContain("La connexion n'a pas abouti");

    element.querySelector<HTMLButtonElement>('button.retry')!.click();

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
