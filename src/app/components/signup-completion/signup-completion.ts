import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { A11yModule } from '@angular/cdk/a11y';
import { MatIconModule } from '@angular/material/icon';
import { LoggerService } from '../../core/logging/logger.service';
import { UserService } from '../../services/user.service';
import { User } from '../../models/user.model';
import { birthDateBounds, birthDateError } from '../../models/birthday.model';

/** One step of the signup completion, asked only while the profile misses its field. */
export interface SignupStep {
  id: 'names' | 'birthDate';
  title: string;
  hint: string;
  isMissing: (user: User) => boolean;
}

const isBlank = (value: string | null | undefined): boolean => !value?.trim();

/**
 * Every step, in order. A step added later is asked of existing users too, alone, since only the
 * missing ones are shown. The names first: Auth0's signup form does not ask them.
 */
export const SIGNUP_STEPS: readonly SignupStep[] = [
  {
    id: 'names',
    title: 'Ton prénom et ton nom',
    hint: 'C\'est comme ça que tes amis te trouveront.',
    isMissing: user => isBlank(user.firstName) || isBlank(user.lastName)
  },
  {
    id: 'birthDate',
    title: 'Ta date de naissance',
    hint: 'Tes amis verront le jour et le mois, jamais ton année.',
    isMissing: user => !user.birthDate
  }
];

/** The steps this user still has to go through; none without a user. */
export function pendingSignupSteps(user: User | null): readonly SignupStep[] {
  return user ? SIGNUP_STEPS.filter(step => step.isMissing(user)) : [];
}

/** wely-users' limit for each name. */
export const MAX_NAME_LENGTH = 255;

/** The message for a name the server would refuse, or null when it is fine. */
function nameError(value: string, missing: string, label: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return missing;
  }
  return trimmed.length > MAX_NAME_LENGTH ? `${label} ne peut pas dépasser ${MAX_NAME_LENGTH} caractères.` : null;
}

/** Whether the signed-in user still misses a field the signup asks, whatever registrationCompleted says. */
export function needsSignupCompletion(user: User | null): boolean {
  return pendingSignupSteps(user).length > 0;
}

/**
 * « Finalise ton inscription »: a blocking card over the app, shown until wely-users records the
 * signup as complete. It cannot be dismissed; saving closes it by updating the current user.
 */
@Component({
  selector: 'app-signup-completion',
  standalone: true,
  imports: [A11yModule, MatIconModule],
  templateUrl: './signup-completion.html',
  styleUrl: './signup-completion.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SignupCompletionComponent {
  private readonly userService = inject(UserService);
  private readonly logger = inject(LoggerService);
  private readonly destroyRef = inject(DestroyRef);

  /** The signed-in user: what they miss decides the steps, what they have prefills and greets. */
  readonly user = input.required<User>();

  /** Fixed when the card opens: saving updates the user, and the steps must not move under it. */
  readonly steps = computed(() => pendingSignupSteps(untracked(this.user)));
  readonly stepIndex = signal(0);
  readonly step = computed(() => this.steps()[this.stepIndex()]);
  readonly isLastStep = computed(() => this.stepIndex() === this.steps().length - 1);

  readonly maxNameLength = MAX_NAME_LENGTH;
  readonly givenFirstName = linkedSignal(() => this.user().firstName ?? '');
  readonly givenLastName = linkedSignal(() => this.user().lastName ?? '');
  readonly firstNameError = computed(() => nameError(this.givenFirstName(), 'Indique ton prénom.', 'Ton prénom'));
  readonly lastNameError = computed(() => nameError(this.givenLastName(), 'Indique ton nom.', 'Ton nom'));

  readonly bounds = birthDateBounds();
  readonly birthDate = signal('');
  /** Shown once the user tried to go on from the current step, not while they type. */
  readonly touched = signal(false);
  readonly fieldError = computed(() => this.step().id === 'names'
    ? this.firstNameError() ?? this.lastNameError()
    : birthDateError(this.birthDate()));
  readonly shownError = computed(() => this.touched() ? this.fieldError() : null);

  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  onFirstName(event: Event): void {
    this.givenFirstName.set((event.target as HTMLInputElement).value);
  }

  onLastName(event: Event): void {
    this.givenLastName.set((event.target as HTMLInputElement).value);
  }

  onBirthDate(event: Event): void {
    this.birthDate.set((event.target as HTMLInputElement).value);
    this.saveError.set(null);
  }

  /** The next step, or the request that completes the signup after the last one. */
  next(): void {
    this.touched.set(true);
    if (this.fieldError() || this.saving()) {
      return;
    }
    if (!this.isLastStep()) {
      this.stepIndex.update(index => index + 1);
      this.touched.set(false);
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    const pending = this.steps().map(step => step.id);
    // Only the missing fields: the others stay as the profile has them.
    this.userService.completeRegistration({
      ...(pending.includes('names') ? { firstName: this.givenFirstName().trim(), lastName: this.givenLastName().trim() } : {}),
      ...(pending.includes('birthDate') ? { birthDate: this.birthDate() } : {})
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // The current user now has registrationCompleted: the layout takes this card away.
        next: () => this.saving.set(false),
        error: (err: unknown) => {
          this.saving.set(false);
          this.saveError.set('Ton inscription n\'a pas pu être finalisée. Réessaie dans un instant.');
          this.logger.error('SignupCompletionComponent', 'Could not complete the registration', err);
        }
      });
  }
}
