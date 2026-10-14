import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PreferencesComponent } from './preferences';
import { AppliedTheme, ThemePreference, ThemeService } from '../../services/theme.service';

describe('PreferencesComponent', () => {
  let fixture: ComponentFixture<PreferencesComponent>;
  let component: PreferencesComponent;
  let preference: ReturnType<typeof signal<ThemePreference>>;
  let applied: ReturnType<typeof signal<AppliedTheme>>;
  let theme: { preference: typeof preference; applied: typeof applied; choose: ReturnType<typeof vi.fn> };

  const el = (): HTMLElement => fixture.nativeElement;
  const radio = (value: ThemePreference) => el().querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
  const option = (value: ThemePreference) => el().querySelector<HTMLElement>(`[data-theme-option="${value}"]`)!;

  beforeEach(() => {
    preference = signal<ThemePreference>('SYSTEM');
    applied = signal<AppliedTheme>('light');
    theme = {
      preference,
      applied,
      choose: vi.fn((chosen: ThemePreference) => {
        preference.set(chosen);
        return of(chosen);
      })
    };
    TestBed.configureTestingModule({
      imports: [PreferencesComponent],
      providers: [{ provide: ThemeService, useValue: theme }]
    });
    fixture = TestBed.createComponent(PreferencesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should offer the light, dark and system themes, the current one checked', () => {
    const labels = Array.from(el().querySelectorAll('.option-label')).map(label => label.textContent?.trim());

    expect(labels).toEqual(['light_mode Clair', 'dark_mode Sombre', 'brightness_auto Système']);
    expect(radio('SYSTEM').checked).toBe(true);
    expect(option('SYSTEM').classList).toContain('selected');
    expect(radio('DARK').checked).toBe(false);
  });

  it('should say what the system theme shows right now', () => {
    expect(option('SYSTEM').textContent).toContain('clair en ce moment');

    applied.set('dark');
    fixture.detectChanges();

    expect(option('SYSTEM').textContent).toContain('sombre en ce moment');
    expect(option('DARK').textContent).toContain('Toujours sombre');
    expect(option('LIGHT').textContent).toContain('Toujours clair');
  });

  it('should apply and keep the dark theme when it is picked', () => {
    radio('DARK').click();
    fixture.detectChanges();

    expect(theme.choose).toHaveBeenCalledWith('DARK');
    expect(radio('DARK').checked).toBe(true);
    expect(option('DARK').querySelector('.check')).not.toBeNull();
    expect(component.saving()).toBe(false);
  });

  it('should not save again the theme already chosen', () => {
    component.choose('SYSTEM');

    expect(theme.choose).not.toHaveBeenCalled();
  });

  it('should hold the choices while one is being saved', () => {
    theme.choose.mockReturnValue(new Subject());

    component.choose('DARK');
    fixture.detectChanges();
    component.choose('LIGHT');

    expect(theme.choose).toHaveBeenCalledTimes(1);
    expect(radio('LIGHT').disabled).toBe(true);
  });

  it('should say so when the theme could not be kept, and let the user try again', () => {
    theme.choose.mockReturnValue(throwError(() => new Error('down')));

    component.choose('DARK');
    fixture.detectChanges();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('n\'a pas pu être enregistré');
    expect(component.saving()).toBe(false);

    theme.choose.mockReturnValue(of('DARK'));
    component.choose('DARK');
    fixture.detectChanges();
    expect(el().querySelector('[role="alert"]')).toBeNull();
  });
});
