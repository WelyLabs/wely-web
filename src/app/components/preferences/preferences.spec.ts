import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { NotificationPreferences } from '../../models/notification.model';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DELETION_CONSEQUENCES, PreferencesComponent } from './preferences';
import { AccountDeletionService, DeletionOutcome } from '../../services/account-deletion.service';
import { UserService } from '../../services/user.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';
import { User } from '../../models/user.model';
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

function accountDeletionStub() {
  return {
    eligibility: vi.fn(() => of(true)),
    authenticationIsFresh: vi.fn(() => true),
    reauthenticate: vi.fn().mockResolvedValue(undefined),
    confirm: vi.fn((): Promise<DeletionOutcome> => Promise.resolve('deleted'))
  };
}

describe('PreferencesComponent', () => {
  let fixture: ComponentFixture<PreferencesComponent>;
  let accountDeletion: ReturnType<typeof accountDeletionStub>;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let accountParam: string | null;
  const camille = { id: 'b-camille', userName: 'camille', hashtag: '2680' } as User;
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
        { provide: NotificationCenterService, useValue: center },
        { provide: AccountDeletionService, useValue: accountDeletion },
        { provide: UserService, useValue: { currentUser$: new BehaviorSubject(camille), getCurrentUserValue: () => camille } },
        { provide: MatDialog, useValue: dialog },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(accountParam ? { account: accountParam } : {}) } } }
      ]
    });
    fixture = TestBed.createComponent(PreferencesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    push = pushStub();
    center = notificationCenterStub();
    accountDeletion = accountDeletionStub();
    dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }) };
    router = { navigate: vi.fn().mockResolvedValue(true) };
    accountParam = null;
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

    it('template_shouldOfferTheBirthdays_onByDefault_whenTheServerDoesNotKnowThemYet', () => {
      center.getPreferences.mockReturnValue(of({ calls: true, messages: true, events: true, friends: true } as NotificationPreferences));
      create();

      expect(toggle('birthdays').getAttribute('aria-checked')).toBe('true');
      expect(setting('birthdays').textContent).toContain('Anniversaires');
    });

    it('setCategory_shouldSaveAllFourChoices', () => {
      create();

      toggle('messages').click();
      fixture.detectChanges();

      expect(center.savePreferences).toHaveBeenCalledWith({ calls: true, messages: false, events: true, friends: true, birthdays: true });
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

  describe('account deletion', () => {
    const card = () => el().querySelector<HTMLElement>('[data-setting="account-deletion"]')!;
    const deleteButton = () => Array.from(card().querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.includes('Supprimer mon compte'));
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };

    afterEach(() => {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    });

    it('ngOnInit_shouldOfferTheDeleteAction_whenTheAccountMayBeDeleted', () => {
      create();

      expect(accountDeletion.eligibility).toHaveBeenCalled();
      expect(deleteButton()?.disabled).toBe(false);
      expect(card().textContent).not.toContain('démonstration');
    });

    it('ngOnInit_shouldDisableTheActionWithTheDemoExplanation_whenNotAllowed', () => {
      accountDeletion.eligibility.mockReturnValue(of(false));
      create();

      expect(deleteButton()?.disabled).toBe(true);
      expect(card().textContent).toContain('Le compte de démonstration ne peut pas être supprimé.');
      expect(dialog.open).not.toHaveBeenCalled();
    });

    it('ngOnInit_shouldSayUnavailable_whenEligibilityCannotBeRead', () => {
      accountDeletion.eligibility.mockReturnValue(throwError(() => new Error('down')));
      create();

      expect(deleteButton()?.disabled).toBe(true);
      expect(card().textContent).toContain('La suppression du compte est indisponible pour le moment.');
    });

    it('ngOnInit_shouldConfirmStraightAway_whenComingBackFromReauthentication', async () => {
      const scrollIntoView = vi.fn();
      Object.assign(Element.prototype, { scrollIntoView });
      accountParam = 'delete';
      create();
      await settle();

      // Back from the sign-in: the confirmation opens by itself, and the marker leaves the address.
      expect(dialog.open).toHaveBeenCalledTimes(1);
      expect(accountDeletion.reauthenticate).not.toHaveBeenCalled();
      expect(scrollIntoView).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({
        queryParams: { account: null }, replaceUrl: true
      }));
    });

    it('ngOnInit_shouldDoNothing_withoutTheDeleteIntent', async () => {
      create();
      await settle();

      expect(dialog.open).not.toHaveBeenCalled();
      expect(component.deletionStep()).toBe('start');
    });

    it('requestDeletion_shouldOpenADestructiveDialogAskingForTheHandle', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(false) });
      create();

      deleteButton()!.click();

      expect(dialog.open).toHaveBeenCalledWith(ConfirmDialogComponent, expect.objectContaining({
        data: expect.objectContaining({ isDestructive: true, confirmationPhrase: 'camille#2680', confirmText: 'Supprimer mon compte' })
      }));
    });

    it('requestDeletion_shouldAnnounceTheGracePeriodAndTheCancellation', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(false) });
      create();

      deleteButton()!.click();

      const { message } = dialog.open.mock.calls[0][1].data as ConfirmDialogData;
      expect(message).toContain('30 jours');
      expect(message).toContain('te reconnecter suffit à tout annuler');
    });

    it('requestDeletion_shouldListEveryConsequence', () => {
      create();

      component.requestDeletion();

      const details: readonly string[] = dialog.open.mock.calls[0][1].data.details;
      expect(details).toBe(DELETION_CONSEQUENCES);
      const all = details.join(' ');
      ['Utilisateur supprimé', 'photos', 'lisibles', 'seul participant', 'dépenses', 'justificatifs', 'sondages clos',
        'communauté', 'jamais réattribué'].forEach(word => expect(all).toContain(word));
    });

    it('requestDeletion_shouldSignInFirst_whenTheSignInIsStale', async () => {
      accountDeletion.authenticationIsFresh.mockReturnValue(false);
      create();

      await component.requestDeletion();

      // Nothing is confirmed before we know who is at the keyboard.
      expect(accountDeletion.reauthenticate).toHaveBeenCalledWith('camille');
      expect(dialog.open).not.toHaveBeenCalled();
      expect(accountDeletion.confirm).not.toHaveBeenCalled();
    });

    it('requestDeletion_shouldDeleteStraightAway_whenTheHandleIsTyped', async () => {
      create();

      await component.requestDeletion();

      expect(accountDeletion.reauthenticate).not.toHaveBeenCalled();
      expect(accountDeletion.confirm).toHaveBeenCalledTimes(1);
      expect(component.deletionError()).toBeNull();
    });

    it('requestDeletion_shouldDoNothing_whenTheDialogIsCancelled', async () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(false) });
      create();

      await component.requestDeletion();

      expect(accountDeletion.confirm).not.toHaveBeenCalled();
    });

    it('requestDeletion_shouldNeverActForAProtectedAccount', async () => {
      accountDeletion.eligibility.mockReturnValue(of(false));
      create();

      await component.requestDeletion();

      expect(dialog.open).not.toHaveBeenCalled();
      expect(accountDeletion.reauthenticate).not.toHaveBeenCalled();
      expect(accountDeletion.confirm).not.toHaveBeenCalled();
    });

    it('requestDeletion_shouldShowItIsDeleting_whileTheServerAnswers', async () => {
      let finish: (outcome: DeletionOutcome) => void = () => undefined;
      accountDeletion.confirm.mockReturnValue(new Promise<DeletionOutcome>(resolve => finish = resolve));
      create();

      const running = component.requestDeletion();
      await settle();
      // The step flips inside the chain settle() drains, so the view needs one more pass.
      fixture.detectChanges();

      expect(component.deletionStep()).toBe('deleting');
      expect(card().textContent).toContain('Suppression en cours');
      finish('deleted');
      await running;
      // The page is being replaced: the step stays as it was.
      expect(component.deletionStep()).toBe('deleting');
    });

    it('requestDeletion_shouldSayTheConfirmationExpired_ratherThanBounce', async () => {
      accountDeletion.confirm.mockResolvedValue('reauthentication-required');
      create();

      await component.requestDeletion();
      fixture.detectChanges();

      expect(component.deletionStep()).toBe('start');
      // Said, not redirected: a redirect here could bounce for ever.
      expect(accountDeletion.reauthenticate).not.toHaveBeenCalled();
      expect(card().querySelector('[role="alert"]')?.textContent).toContain('a expiré');
    });

    it('requestDeletion_shouldShowTheDemoMessage_whenProtected', async () => {
      accountDeletion.confirm.mockResolvedValue('protected');
      create();

      await component.requestDeletion();
      fixture.detectChanges();

      expect(component.deletionAllowed()).toBe(false);
      expect(card().textContent).toContain('Le compte de démonstration ne peut pas être supprimé.');
    });

    it('requestDeletion_shouldShowUnavailable_whenTheServerAnswersUsrBus014', async () => {
      accountDeletion.confirm.mockResolvedValue('unavailable');
      create();

      await component.requestDeletion();
      fixture.detectChanges();

      expect(component.deletionStep()).toBe('start');
      expect(component.deletionUnavailable()).toBe(true);
    });

    it('requestDeletion_shouldShowAnError_whenItFails', async () => {
      accountDeletion.confirm.mockResolvedValue('failed');
      create();

      await component.requestDeletion();
      fixture.detectChanges();

      expect(component.deletionStep()).toBe('start');
      expect(card().querySelector('[role="alert"]')?.textContent).toContain('La suppression n’a pas abouti');
      expect(deleteButton()?.disabled).toBe(false);
    });


  });
});
