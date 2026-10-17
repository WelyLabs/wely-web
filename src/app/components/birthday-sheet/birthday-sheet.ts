import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AvatarService } from '../../services/avatar.service';
import { avatarColor, initialsOf } from '../../core/ui/avatar';
import { BirthdayOccurrence, birthdayEmoji, birthdayTone, dayMonthLabel, parseLocalDate } from '../../models/birthday.model';

/** What the sheet asks the calendar to do once closed; nothing when simply dismissed. */
export type BirthdaySheetAction = 'organize' | 'join' | 'view' | 'profile';

/** One of the sheet's buttons. */
export interface BirthdaySheetOption {
  action: BirthdaySheetAction;
  label: string;
  primary: boolean;
}

/** The buttons a birthday offers: organize when one may, join or see a surprise already planned. */
export function birthdayOptions(birthday: BirthdayOccurrence): BirthdaySheetOption[] {
  if (birthday.mine) {
    return [];
  }
  const options: BirthdaySheetOption[] = [];
  if (birthday.surprise) {
    if (!birthday.surprise.joined) {
      options.push({ action: 'join', label: 'Rejoindre la surprise', primary: true });
    }
    options.push({ action: 'view', label: 'Voir la surprise', primary: birthday.surprise.joined });
  } else if (birthday.canOrganize) {
    options.push({ action: 'organize', label: 'Organiser une surprise', primary: true });
  }
  options.push({ action: 'profile', label: 'Voir son profil', primary: false });
  return options;
}

/** « Anniversaire de Léa · 12 mars », or « Ton anniversaire · 12 mars ». */
export function birthdayHeading(birthday: BirthdayOccurrence): string {
  const date = parseLocalDate(birthday.date);
  const day = date ? dayMonthLabel(date.getMonth() + 1, date.getDate()) : '';
  const who = birthday.mine ? 'Ton anniversaire' : `Anniversaire de ${birthday.name}`;
  return day ? `${who} · ${day}` : who;
}

/** A birthday tapped in the calendar: who, when, and what can be done for it. */
@Component({
  selector: 'app-birthday-sheet',
  standalone: true,
  imports: [MatDialogModule, MatIconModule],
  templateUrl: './birthday-sheet.html',
  styleUrl: './birthday-sheet.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BirthdaySheetComponent {
  readonly birthday = inject<BirthdayOccurrence>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<BirthdaySheetComponent, BirthdaySheetAction>>(MatDialogRef);
  private readonly avatars = inject(AvatarService);

  readonly tone = birthdayTone(this.birthday);
  readonly emoji = birthdayEmoji(this.tone);
  readonly picture = this.avatars.url(this.birthday.userId);
  readonly color = avatarColor(this.birthday.userId);
  readonly initials = initialsOf(this.birthday.name || '?');
  readonly options = birthdayOptions(this.birthday);

  readonly heading = birthdayHeading(this.birthday);

  readonly hint = this.birthday.mine
    ? 'Tes amis voient le jour, jamais ton année.'
    : this.birthday.surprise
      ? `Une surprise se prépare, ${this.birthday.name} n'en saura rien.`
      : this.birthday.canOrganize ? 'Tout est prêt : il ne reste qu\'à créer la surprise.' : 'Un petit mot lui ferait plaisir.';

  choose(action: BirthdaySheetAction): void {
    this.dialogRef.close(action);
  }

  close(): void {
    this.dialogRef.close();
  }
}
