import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggle, MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { NotificationPreferences } from '../../models/notification.model';
import { NotificationCenterService } from '../../services/notification-center.service';
import { PushService, PushState } from '../../services/push.service';
import { ThemePreference, ThemeService } from '../../services/theme.service';

interface CategoryOption {
  key: keyof NotificationPreferences;
  label: string;
  detail: string;
}

const DEVICE_HINTS: Record<PushState, string> = {
  unsupported: 'Ce navigateur ne permet pas les notifications.',
  unavailable: 'Les notifications ne sont pas encore disponibles sur ce serveur.',
  denied: 'Bloquées par ton navigateur. Autorise les notifications pour Wely dans les réglages du site '
    + '(le cadenas à gauche de l\'adresse), puis recharge la page.',
  enabled: 'Activées : tu es prévenu même quand Wely est fermé.',
  disabled: 'Désactivées sur cet appareil.'
};

interface ThemeOption {
  value: ThemePreference;
  label: string;
  icon: string;
}

/**
 * The account's preferences: the app's theme and the notifications. A choice applies at once,
 * then is kept with the account; a refused save puts the previous value back and says so.
 * Push on this device is the exception: it belongs to the browser, not the account.
 */
@Component({
  selector: 'app-preferences',
  imports: [MatIconModule, MatSlideToggleModule],
  templateUrl: './preferences.html',
  styleUrl: './preferences.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PreferencesComponent implements OnInit {
  private readonly theme = inject(ThemeService);
  private readonly push = inject(PushService);
  private readonly center = inject(NotificationCenterService);
  private readonly destroyRef = inject(DestroyRef);

  readonly options: readonly ThemeOption[] = [
    { value: 'LIGHT', label: 'Clair', icon: 'light_mode' },
    { value: 'DARK', label: 'Sombre', icon: 'dark_mode' },
    { value: 'SYSTEM', label: 'Système', icon: 'brightness_auto' }
  ];

  readonly categories: readonly CategoryOption[] = [
    { key: 'calls', label: 'Appels', detail: 'Quand on t\'appelle, et les appels manqués.' },
    { key: 'messages', label: 'Messages', detail: 'Les nouveaux messages de tes discussions.' },
    { key: 'events', label: 'Événements', detail: 'Une date fixée ou un événement déplacé.' },
    { key: 'friends', label: 'Amis', detail: 'Les demandes d\'ami et celles acceptées.' }
  ];

  readonly pushState = this.push.state;
  readonly pushBusy = this.push.busy;
  readonly needsHomeScreen = this.push.needsHomeScreen;
  readonly deviceHint = computed(() => DEVICE_HINTS[this.pushState()]);
  /** Only on or off can be switched; the other states need something done elsewhere. */
  readonly deviceToggleable = computed(() => this.pushState() === 'enabled' || this.pushState() === 'disabled');
  readonly deviceError = signal<string | null>(null);

  readonly notificationPrefs = signal<NotificationPreferences | null>(null);
  readonly prefsSaving = signal(false);
  readonly prefsError = signal<string | null>(null);

  readonly selected = this.theme.preference;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  /** What SYSTEM shows right now, so choosing it is no guess. */
  readonly systemHint = computed(() =>
    `Suit le réglage de ton appareil, ${this.theme.applied() === 'dark' ? 'sombre' : 'clair'} en ce moment.`);

  ngOnInit(): void {
    void this.push.refresh();
    this.center.getPreferences()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: preferences => this.notificationPrefs.set(preferences),
        error: () => this.prefsError.set('Tes réglages de notifications n\'ont pas pu être chargés.')
      });
  }

  /** Enables or disables push here; the toggle follows the outcome, not the click. */
  async toggleDevice(change: MatSlideToggleChange): Promise<void> {
    this.deviceError.set(null);
    const done = change.checked ? await this.push.enable() : await this.push.disable();
    if (!done && this.pushState() !== 'denied') {
      this.deviceError.set(change.checked
        ? 'Les notifications n\'ont pas pu être activées. Réessaie dans un instant.'
        : 'Les notifications n\'ont pas pu être désactivées. Réessaie dans un instant.');
    }
    this.resync(change.source);
  }

  setCategory(key: keyof NotificationPreferences, change: MatSlideToggleChange): void {
    const previous = this.notificationPrefs();
    if (!previous || this.prefsSaving()) {
      change.source.checked = previous?.[key] ?? false;
      return;
    }
    const next = { ...previous, [key]: change.checked };
    this.notificationPrefs.set(next);
    this.prefsSaving.set(true);
    this.prefsError.set(null);
    this.center.savePreferences(next).subscribe({
      next: () => this.prefsSaving.set(false),
      error: () => {
        this.prefsSaving.set(false);
        this.notificationPrefs.set(previous);
        change.source.checked = previous[key];
        this.prefsError.set('Ce réglage n\'a pas pu être enregistré. Réessaie dans un instant.');
      }
    });
  }

  /** Puts the device toggle back on the actual state after a refused change. */
  private resync(toggle: MatSlideToggle): void {
    toggle.checked = this.pushState() === 'enabled';
  }

  choose(theme: ThemePreference): void {
    if (theme === this.selected() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.theme.choose(theme).subscribe({
      next: () => this.saving.set(false),
      error: () => {
        this.saving.set(false);
        this.error.set('Le thème n\'a pas pu être enregistré. Réessaie dans un instant.');
      }
    });
  }

  detailOf(option: ThemeOption): string {
    switch (option.value) {
      case 'LIGHT':
        return 'Toujours clair.';
      case 'DARK':
        return 'Toujours sombre.';
      default:
        return this.systemHint();
    }
  }
}
