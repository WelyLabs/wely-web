import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { A11yModule } from '@angular/cdk/a11y';
import { MatIconModule } from '@angular/material/icon';
import { LoggerService } from '../../core/logging/logger.service';
import { UserService } from '../../services/user.service';
import { User } from '../../models/user.model';
import { birthDateBounds, birthDateError } from '../../models/birthday.model';

/** One step of the signup completion; more will be added, each with its own field. */
export interface SignupStep {
  id: 'birthDate';
  title: string;
  hint: string;
}

/** The steps, in order. Today, only the birth date. */
export const SIGNUP_STEPS: readonly SignupStep[] = [
  { id: 'birthDate', title: 'Ta date de naissance', hint: 'Tes amis verront le jour et le mois, jamais ton année.' }
];

/** Whether the signed-in user still has steps to complete before using the app. */
export function needsSignupCompletion(user: User | null): boolean {
  return user?.registrationCompleted === false;
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

  /** The first name, to greet; empty when unknown. */
  readonly firstName = input('');

  readonly steps = SIGNUP_STEPS;
  readonly stepIndex = signal(0);
  readonly step = computed(() => this.steps[this.stepIndex()]);
  readonly isLastStep = computed(() => this.stepIndex() === this.steps.length - 1);

  readonly bounds = birthDateBounds();
  readonly birthDate = signal('');
  /** Shown once the user tried to go on, not while they type. */
  readonly touched = signal(false);
  readonly fieldError = computed(() => birthDateError(this.birthDate()));
  readonly shownError = computed(() => this.touched() ? this.fieldError() : null);

  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

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
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    this.userService.completeRegistration({ birthDate: this.birthDate() })
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
