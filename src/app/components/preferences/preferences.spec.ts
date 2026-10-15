import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PreferencesComponent } from './preferences';
import { AppliedTheme, ThemePreference, ThemeService } from '../../services/theme.service';
import { PushService, PushState } from '../../services/push.service';
import { NotificationCenterService } from '../../services/notification-center.service';
import { notificationCenterStub } from '../../../testing/notification-center.stub';

function pushStub() {
  const state = signal<PushState>('disabled');
  return {
    state,
    busy: signal(false),
    needsHomeScreen: false,
    refresh: vi.fn().mockResolvedValue(undefined),
    enable: vi.fn(async () => {
      state.set('enabled');
      return true;
    }),
    disable: vi.fn(async () => {
      state.set('disabled');
      return true;
    })
  };
}

describe('PreferencesComponent', () => {
  let fixture: ComponentFixture<PreferencesComponent>;
  let component: PreferencesComponent;
  let preference: ReturnType<typeof signal<ThemePreference>>;
  let applied: ReturnType<typeof signal<AppliedTheme>>;
  let theme: { preference: typeof preference; applied: typeof applied; choose: ReturnType<typeof vi.fn> };
  let push: ReturnType<typeof pushStub>;
  let center: ReturnType<typeof notificationCenterStub>;

  const el = (): HTMLElement => fixture.nativeElement;
  const radio = (value: ThemePreference) => el().querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
  const option = (value: ThemePreference) => el().querySelector<HTMLElement>(`[data-theme-option="${value}"]`)!;

  function create(): void {
    TestBed.configureTestingModule({
      imports: [PreferencesComponent],
      providers: [
        { provide: ThemeService, useValue: theme },
        { provide: PushService, useValue: push },
        { provide: NotificationCenterService, useValue: center }
      ]
    });
    fixture = TestBed.createComponent(PreferencesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    push = pushStub();
    center = notificationCenterStub();
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
  });

  describe('theme', () => {
  beforeEach(() => create());

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

  describe('notifications', () => {
    const setting = (name: string) => el().querySelector<HTMLElement>(`[data-setting="${name}"]`)!;
    const toggle = (name: string) => setting(name).querySelector<HTMLButtonElement>('button[role="switch"]')!;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('ngOnInit_shouldReadThePushStateAndTheCategories', () => {
      create();

      expect(push.refresh).toHaveBeenCalled();
      expect(center.getPreferences).toHaveBeenCalled();
      expect(toggle('messages').getAttribute('aria-checked')).toBe('true');
    });

    it('toggleDevice_shouldEnablePushOnThisDevice', async () => {
      create();
      expect(setting('device').textContent).toContain('Désactivées sur cet appareil');

      toggle('device').click();
      await settle();

      expect(push.enable).toHaveBeenCalled();
      expect(toggle('device').getAttribute('aria-checked')).toBe('true');
      expect(setting('device').textContent).toContain('même quand Wely est fermé');
    });

    it('toggleDevice_shouldDisablePush_whenItWasOn', async () => {
      push.state.set('enabled');
      create();

      toggle('device').click();
      await settle();

      expect(push.disable).toHaveBeenCalled();
      expect(toggle('device').getAttribute('aria-checked')).toBe('false');
    });

    it('toggleDevice_shouldSaySo_andStayOff_whenEnablingFails', async () => {
      push.enable.mockResolvedValue(false);
      create();

      toggle('device').click();
      await settle();

      expect(el().querySelector('[role="alert"]')?.textContent).toContain('n\'ont pas pu être activées');
      expect(toggle('device').getAttribute('aria-checked')).toBe('false');
    });

    it('toggleDevice_shouldExplainHowToUnblock_whenTheUserRefused', async () => {
      push.enable.mockImplementation(async () => {
        push.state.set('denied');
        return false;
      });
      create();

      toggle('device').click();
      await settle();

      expect(el().querySelector('[role="alert"]')).toBeNull();
      expect(setting('device').textContent).toContain('réglages du site');
      expect(toggle('device').disabled).toBe(true);
    });

    it.each([
      ['unsupported', 'ne permet pas les notifications'],
      ['unavailable', 'pas encore disponibles sur ce serveur']
    ] as [PushState, string][])('template_shouldLockTheDeviceToggle_when %s', (state, text) => {
      push.state.set(state);
      create();

      expect(setting('device').textContent).toContain(text);
      expect(toggle('device').disabled).toBe(true);
    });

    it('template_shouldExplainTheHomeScreen_onAnIphoneInSafari', () => {
      push.needsHomeScreen = true;
      create();

      expect(el().querySelector('.ios-hint')?.textContent).toContain('ajoute Wely à l\'écran d\'accueil');
    });

    it('template_shouldNotShowTheIphoneHint_elsewhere', () => {
      create();

      expect(el().querySelector('.ios-hint')).toBeNull();
    });

    it('setCategory_shouldSaveAllFourChoices', () => {
      create();

      toggle('messages').click();
      fixture.detectChanges();

      expect(center.savePreferences).toHaveBeenCalledWith({ calls: true, messages: false, events: true, friends: true });
      expect(component.notificationPrefs()?.messages).toBe(false);
    });

    it('setCategory_shouldPutTheChoiceBack_whenTheSaveFails', () => {
      center.savePreferences.mockReturnValue(throwError(() => new Error('down')));
      create();

      toggle('friends').click();
      fixture.detectChanges();

      expect(component.notificationPrefs()?.friends).toBe(true);
      expect(toggle('friends').getAttribute('aria-checked')).toBe('true');
      expect(el().querySelector('[role="alert"]')?.textContent).toContain('n\'a pas pu être enregistré');
    });

    it('setCategory_shouldWaitForTheSaveInProgress', () => {
      center.savePreferences.mockReturnValue(new Subject<undefined>());
      create();

      toggle('calls').click();
      fixture.detectChanges();

      expect(toggle('events').disabled).toBe(true);
    });

    it('template_shouldLockTheCategories_whenTheyCouldNotBeLoaded', () => {
      center.getPreferences.mockReturnValue(throwError(() => new Error('down')));
      create();

      expect(toggle('calls').disabled).toBe(true);
      expect(el().querySelector('[role="alert"]')?.textContent).toContain('n\'ont pas pu être chargés');
    });
  });
});
