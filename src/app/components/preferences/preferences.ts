import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, OnInit, afterNextRender, computed, inject, signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggle, MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ACCOUNT_QUERY_PARAM } from '../../models/account.model';
import { NotificationPreferences } from '../../models/notification.model';
import { AccountDeletionService } from '../../services/account-deletion.service';
import { NotificationCenterService } from '../../services/notification-center.service';
import { PushService, PushState } from '../../services/push.service';
import { ThemePreference, ThemeService } from '../../services/theme.service';
import { UserService } from '../../services/user.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';

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

/** What deleting the account does, as the confirmation lists it. */
export const DELETION_CONSEQUENCES: readonly string[] = [
  'Ton profil, ta photo, tes amis, tes notifications et tes réglages sont effacés. Ton pseudo ne sera jamais réattribué.',
  'Tes messages et les photos que tu as envoyées restent visibles dans les discussions, signés « Utilisateur supprimé ».',
  'Tes conversations privées restent lisibles par l’autre personne, mais plus personne ne pourra y écrire.',
  'Les événements que tu organises passent au participant inscrit depuis le plus longtemps. Ceux dont tu es le seul '
    + 'participant restant sont supprimés, avec leurs dépenses, leur couverture et leur discussion.',
  'Tu quittes les événements à venir et tes votes sur les sondages en cours sont retirés. Ta participation aux '
    + 'événements passés et tes votes sur les sondages clos restent, sous « Utilisateur supprimé ».',
  'Les dépenses restent dans les comptes de leurs événements, sans les justificatifs que tu as ajoutés.',
  'Dans tes communautés, un autre membre devient administrateur ; une communauté dont tu es le seul membre est supprimée.'
];

/** The account section's step: nothing asked yet, the final confirmation, or the deletion running. */
export type DeletionStep = 'start' | 'confirm' | 'deleting';

const DELETION_FAILED = 'La suppression n’a pas abouti. Réessaie dans un instant.';
const STORAGE_BLOCKED = 'Ton navigateur bloque le stockage de session : autorise-le pour Wely, puis réessaie.';

interface ThemeOption {
  value: ThemePreference;
  label: string;
  icon: string;
}

/**
 * The account's preferences: the app's theme, the notifications, and deleting the account. A choice
 * applies at once, then is kept with the account; a refused save puts the previous value back and
 * says so. Push on this device is the exception: it belongs to the browser, not the account.
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
  private readonly accountDeletion = inject(AccountDeletionService);
  private readonly userService = inject(UserService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  private readonly accountCard = viewChild<ElementRef<HTMLElement>>('accountCard');
  private readonly me = toSignal(this.userService.currentUser$, { initialValue: this.userService.getCurrentUserValue() });

  /** The handle typed to confirm the deletion, as name#hashtag. */
  readonly handle = computed(() => {
    const me = this.me();
    return me ? `${me.userName}#${me.hashtag}` : null;
  });
  /** Null while wely-users has not answered whether this account may be deleted. */
  readonly deletionAllowed = signal<boolean | null>(null);
  readonly deletionUnavailable = signal(false);
  readonly deletionStep = signal<DeletionStep>('start');
  readonly deletionError = signal<string | null>(null);
  /** The re-authentication is too old, or was not done: the user signs in again before deleting. */
  readonly reverifyNeeded = signal(false);
  readonly canRequestDeletion = computed(() => this.deletionAllowed() === true && this.handle() !== null);

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
    this.accountDeletion.eligibility()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: allowed => this.onEligibility(allowed),
        error: () => this.deletionUnavailable.set(true)
      });
  }

  /** Opens the typed confirmation, then the re-authentication that leads back to the final step. */
  requestDeletion(): void {
    const me = this.me();
    const handle = this.handle();
    if (!this.canRequestDeletion() || !me || !handle) {
      return;
    }
    const data: ConfirmDialogData = {
      title: 'Supprimer ton compte ?',
      message: 'La suppression est définitive. Pour finir, tu devras te reconnecter.',
      details: DELETION_CONSEQUENCES,
      confirmationPhrase: handle,
      confirmationLabel: `Pour confirmer, tape ${handle}`,
      confirmText: 'Continuer',
      cancelText: 'Annuler',
      isDestructive: true
    };
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '520px',
      maxWidth: '95vw',
      data,
      panelClass: 'confirm-dialog-panel'
    }).afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(confirmed => {
        if (confirmed) {
          void this.startReauthentication();
        }
      });
  }

  /** Sends the deletion, once the user confirmed it after re-authenticating. */
  async confirmDeletion(): Promise<void> {
    if (this.deletionStep() !== 'confirm') {
      return;
    }
    this.deletionStep.set('deleting');
    this.deletionError.set(null);
    switch (await this.accountDeletion.confirm()) {
      case 'deleted':
        // The page is being replaced by the landing.
        return;
      case 'reauthentication-required':
        this.deletionStep.set('start');
        this.reverifyNeeded.set(true);
        return;
      case 'protected':
        this.deletionStep.set('start');
        this.deletionAllowed.set(false);
        return;
      case 'unavailable':
        this.deletionStep.set('start');
        this.deletionUnavailable.set(true);
        return;
      default:
        this.deletionStep.set('confirm');
        this.deletionError.set(DELETION_FAILED);
    }
  }

  /** Signs in again when the re-authentication expired; always from a click, so it cannot loop. */
  reverify(): void {
    void this.startReauthentication();
  }

  /** Gives up the deletion, and the intent in the address. */
  cancelDeletion(): void {
    this.accountDeletion.cancel();
    this.deletionStep.set('start');
    this.reverifyNeeded.set(false);
    this.deletionError.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [ACCOUNT_QUERY_PARAM]: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private onEligibility(allowed: boolean): void {
    this.deletionAllowed.set(allowed);
    const me = this.me();
    if (!allowed || !me) {
      return;
    }
    const step = this.accountDeletion.pendingStep(me.id, this.route.snapshot.queryParamMap.get(ACCOUNT_QUERY_PARAM));
    if (step === 'confirm') {
      this.deletionStep.set('confirm');
      afterNextRender(() => this.accountCard()?.nativeElement.scrollIntoView?.({ block: 'center' }), { injector: this.injector });
    } else if (step === 'reverify') {
      this.reverifyNeeded.set(true);
    }
  }

  private async startReauthentication(): Promise<void> {
    const me = this.me();
    if (!me) {
      return;
    }
    this.deletionError.set(null);
    if (!(await this.accountDeletion.start(me))) {
      this.deletionError.set(STORAGE_BLOCKED);
    }
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
