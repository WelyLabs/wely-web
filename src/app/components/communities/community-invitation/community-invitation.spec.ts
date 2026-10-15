import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityInvitationComponent } from './community-invitation';
import { CommunityService } from '../../../services/community.service';
import { CommunityInvitation } from '../../../models/community.model';

const invitation = (expired = false): CommunityInvitation => ({
  token: 'tok', communityId: 'c1', communityName: "Les copains d'abord", visibility: 'PRIVATE', inviterId: 'lea',
  inviterName: 'lea', inviteeId: 'me', inviteeName: 'me', createdAt: '2026-10-15T09:30:00Z',
  expiresAt: '2026-10-18T09:30:00Z', expired,
});

describe('CommunityInvitationComponent', () => {
  let communities: { invitation: ReturnType<typeof vi.fn>; accept: ReturnType<typeof vi.fn> };
  let router: Router;

  function open() {
    TestBed.configureTestingModule({
      imports: [CommunityInvitationComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: CommunityService, useValue: communities },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ token: 'tok' })) } },
      ],
    });
    router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(CommunityInvitationComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    communities = {
      invitation: vi.fn().mockReturnValue(of(invitation())),
      accept: vi.fn().mockReturnValue(of({ communityId: 'c1' })),
    };
  });

  it('shows who invites to what', () => {
    const fixture = open();

    expect(communities.invitation).toHaveBeenCalledWith('tok');
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain("Les copains d'abord");
    expect(fixture.nativeElement.textContent).toContain('Rejoindre la communauté');
  });

  it('joins and goes to the community', () => {
    const fixture = open();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.accept();

    expect(communities.accept).toHaveBeenCalledWith('tok');
    expect(navigate).toHaveBeenCalledWith(['/communities', 'c1']);
  });

  it('says clearly when the invitation has expired, and offers no button', () => {
    communities.invitation.mockReturnValue(of(invitation(true)));
    const fixture = open();

    expect(fixture.nativeElement.textContent).toContain('Invitation expirée');
    fixture.componentInstance.accept();
    expect(communities.accept).not.toHaveBeenCalled();
  });

  it('turns to the expired page when it expires while open', () => {
    communities.accept.mockReturnValue(throwError(() => ({ error: { code: 'SCL-BUS-014' } })));
    const fixture = open();

    fixture.componentInstance.accept();

    expect(fixture.componentInstance.invitation()?.expired).toBe(true);
  });

  it('explains any other refusal when accepting', () => {
    communities.accept.mockReturnValue(throwError(() => ({ error: { code: 'SCL-BUS-013' } })));
    const fixture = open();

    fixture.componentInstance.accept();

    expect(fixture.componentInstance.problem()).toContain('déjà été utilisée');
  });

  it('explains why an invitation cannot be read', () => {
    communities.invitation.mockReturnValue(throwError(() => ({ error: { code: 'SCL-BUS-013' } })));
    const fixture = open();

    expect(fixture.nativeElement.textContent).toContain('Invitation indisponible');
    expect(fixture.componentInstance.problem()).toContain('ne vous est pas destinée');
  });

  it('falls back to a generic message', () => {
    communities.invitation.mockReturnValue(throwError(() => ({})));

    expect(open().componentInstance.problem()).toContain("n'a pas pu être chargée");
  });

  it('does nothing without an invitation', () => {
    communities.invitation.mockReturnValue(throwError(() => ({})));
    const fixture = open();

    fixture.componentInstance.accept();

    expect(communities.accept).not.toHaveBeenCalled();
  });
});
