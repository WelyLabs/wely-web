import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityFormDialogComponent } from './community-form-dialog';
import { CommunityService } from '../../../services/community.service';
import { Community } from '../../../models/community.model';

const existing: Community = {
  communityId: 'c1', name: 'Club', description: 'Voitures', interests: ['auto'], visibility: 'PRIVATE',
  createdAt: '2026-10-01T10:00:00Z', memberCount: 2, role: 'ADMIN', friendMembers: [], friendMemberCount: 0,
};

describe('CommunityFormDialogComponent', () => {
  let communities: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  function open(data: Community | null = null) {
    TestBed.configureTestingModule({
      imports: [CommunityFormDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: CommunityService, useValue: communities },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });
    const fixture = TestBed.createComponent(CommunityFormDialogComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    communities = { create: vi.fn().mockReturnValue(of(existing)), update: vi.fn().mockReturnValue(of(existing)) };
    dialogRef = { close: vi.fn() };
  });

  it('creates a community and closes with it', () => {
    const form = open();
    form.name.set('  Club auto  ');
    form.description.set('  ');
    form.interestDraft.set('#Balades');

    form.save();

    expect(communities.create).toHaveBeenCalledWith({ name: 'Club auto', description: null, interests: ['balades'],
      visibility: 'PUBLIC' });
    expect(dialogRef.close).toHaveBeenCalledWith(existing);
  });

  it('edits the community it was opened with', () => {
    const form = open(existing);
    expect(form.name()).toBe('Club');
    expect(form.visibility()).toBe('PRIVATE');

    form.visibility.set('PUBLIC');
    form.save();

    expect(communities.update).toHaveBeenCalledWith('c1', { name: 'Club', description: 'Voitures', interests: ['auto'],
      visibility: 'PUBLIC' });
  });

  it('turns typed interests into chips, without duplicates, up to five', () => {
    const form = open();
    for (const interest of ['auto', 'AUTO', 'rando', 'jeux', 'vélo', 'course', 'surplus']) {
      form.interestDraft.set(interest);
      form.addInterest(new Event('keydown'));
    }

    expect(form.interests()).toEqual(['auto', 'rando', 'jeux', 'vélo', 'course']);
    expect(form.interestDraft()).toBe('');

    form.removeInterest('rando');
    expect(form.interests()).toEqual(['auto', 'jeux', 'vélo', 'course']);
  });

  it('refuses a name that is too short, without calling the backend', () => {
    const form = open();
    form.name.set('ab');

    expect(form.valid()).toBe(false);
    form.save();
    expect(communities.create).not.toHaveBeenCalled();
  });

  it('words the backend\'s refusal', () => {
    communities.create.mockReturnValue(throwError(() => ({ error: { code: 'SCL-BUS-012' } })));
    const form = open();
    form.name.set('Club');

    form.save();

    expect(form.error()).toContain('3 à 60 caractères');
    expect(form.saving()).toBe(false);
  });

  it('falls back to a generic message', () => {
    communities.create.mockReturnValue(throwError(() => ({ error: null })));
    const form = open();
    form.name.set('Club');

    form.save();

    expect(form.error()).toContain('réessayez');
  });

  it('closes with nothing when cancelled', () => {
    open().cancel();

    expect(dialogRef.close).toHaveBeenCalledWith();
  });
});
