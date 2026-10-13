import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AboutDialogComponent, INTEREST_SUGGESTIONS } from './about-dialog';
import { ProfileAbout, UserService } from '../../services/user.service';

describe('AboutDialogComponent', () => {
  let fixture: ComponentFixture<AboutDialogComponent>;
  let component: AboutDialogComponent;
  let userService: { updateAbout: ReturnType<typeof vi.fn> };
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  const create = (initial: ProfileAbout = { bio: null, interests: [] }) => {
    TestBed.configureTestingModule({
      imports: [AboutDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: UserService, useValue: userService },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: initial }
      ]
    });
    fixture = TestBed.createComponent(AboutDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(() => {
    userService = { updateAbout: vi.fn().mockImplementation((about: ProfileAbout) => of(about)) };
    dialogRef = { close: vi.fn() };
  });

  it('constructor_shouldStartFromWhatIsStored', () => {
    create({ bio: 'Partante', interests: ['Rando'] });

    expect(component.bio()).toBe('Partante');
    expect(component.interests()).toEqual(['Rando']);
  });

  it('add_shouldTidyAndRefuseDuplicatesWhateverTheCase', () => {
    create();
    component.add('  Jeux   de société ');
    component.add('jeux de société');

    expect(component.interests()).toEqual(['Jeux de société']);
  });

  it('add_shouldStopAtFive', () => {
    create({ bio: null, interests: ['a', 'b', 'c', 'd', 'e'] });

    component.add('f');

    expect(component.interests()).toHaveLength(5);
    expect(component.full()).toBe(true);
    expect(fixture.nativeElement.querySelector('#about-interest')).toBeNull();
  });

  it('onDraftKey_shouldAddOnEnterOrComma', () => {
    create();
    component.draft.set('Ciné');
    const enter = new KeyboardEvent('keydown', { key: 'Enter' });
    const prevent = vi.spyOn(enter, 'preventDefault');

    component.onDraftKey(enter);

    expect(prevent).toHaveBeenCalled();
    expect(component.interests()).toEqual(['Ciné']);
    expect(component.draft()).toBe('');
  });

  it('suggestions_shouldLeaveOutWhatIsAlreadyThere', () => {
    create({ bio: null, interests: ['cinéma'] });

    expect(component.suggestions()).not.toContain('Cinéma');
    expect(component.suggestions()).toHaveLength(INTEREST_SUGGESTIONS.length - 1);
  });

  it('save_shouldSendTheBioAndInterests_includingWhatWasTypedButNotAdded', () => {
    create();
    component.bio.set('  Partante  ');
    component.add('Rando');
    component.draft.set('Ciné');

    component.save();

    expect(userService.updateAbout).toHaveBeenCalledWith({ bio: 'Partante', interests: ['Rando', 'Ciné'] });
    expect(dialogRef.close).toHaveBeenCalledWith({ bio: 'Partante', interests: ['Rando', 'Ciné'] });
  });

  it('save_shouldSendNoBio_whenItIsBlank', () => {
    create({ bio: 'Ancienne', interests: [] });
    component.bio.set('   ');

    component.save();

    expect(userService.updateAbout).toHaveBeenCalledWith({ bio: null, interests: [] });
  });

  it('save_shouldHoldABioOverTheLimit', () => {
    create();
    component.bio.set('x'.repeat(161));

    component.save();

    expect(component.bioLeft()).toBe(-1);
    expect(userService.updateAbout).not.toHaveBeenCalled();
  });

  it('save_shouldSayWhenItFails_andStayOpen', () => {
    userService.updateAbout.mockReturnValue(throwError(() => new Error('down')));
    create();

    component.save();

    expect(component.errorMessage()).toContain('L’enregistrement a échoué');
    expect(dialogRef.close).not.toHaveBeenCalled();
  });
});
