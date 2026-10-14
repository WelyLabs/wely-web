import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ThemePreference, ThemeService } from '../../services/theme.service';

interface ThemeOption {
  value: ThemePreference;
  label: string;
  icon: string;
}

/**
 * The account's preferences, today the app's theme. A choice applies at once, then is kept with
 * the account; a refused save puts the previous theme back and says so.
 */
@Component({
  selector: 'app-preferences',
  imports: [MatIconModule],
  templateUrl: './preferences.html',
  styleUrl: './preferences.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PreferencesComponent {
  private readonly theme = inject(ThemeService);

  readonly options: readonly ThemeOption[] = [
    { value: 'LIGHT', label: 'Clair', icon: 'light_mode' },
    { value: 'DARK', label: 'Sombre', icon: 'dark_mode' },
    { value: 'SYSTEM', label: 'Système', icon: 'brightness_auto' }
  ];

  readonly selected = this.theme.preference;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  /** What SYSTEM shows right now, so choosing it is no guess. */
  readonly systemHint = computed(() =>
    `Suit le réglage de ton appareil, ${this.theme.applied() === 'dark' ? 'sombre' : 'clair'} en ce moment.`);

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
