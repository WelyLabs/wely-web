import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunitiesPageComponent } from './communities-page';
import { CommunityService } from '../../../services/community.service';
import { Community } from '../../../models/community.model';

const community = (id: string, interests: string[] = [], role: Community['role'] = null): Community => ({
  communityId: id, name: id, description: null, interests, visibility: 'PUBLIC', createdAt: '2026-10-01T10:00:00Z',
  memberCount: 1, role, friendMembers: [], friendMemberCount: 0, pictureUrl: null,
});

describe('CommunitiesPageComponent', () => {
  let communities: { mine: ReturnType<typeof vi.fn>; discover: ReturnType<typeof vi.fn> };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let router: Router;

  function create() {
    const fixture = TestBed.createComponent(CommunitiesPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    communities = {
      mine: vi.fn().mockReturnValue(of([community('mine', [], 'MEMBER')])),
      discover: vi.fn().mockReturnValue(of([community('a', ['auto', 'rando']), community('b', ['auto'])])),
    };
    dialog = { open: vi.fn() };
    TestBed.configureTestingModule({
      imports: [CommunitiesPageComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: CommunityService, useValue: communities },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    router = TestBed.inject(Router);
  });

  afterEach(() => vi.useRealTimers());

  it('opens on my communities', () => {
    const fixture = create();

    expect(communities.mine).toHaveBeenCalled();
    expect(fixture.componentInstance.mine().map((c) => c.communityId)).toEqual(['mine']);
    expect(fixture.nativeElement.querySelectorAll('app-community-card').length).toBe(1);
  });

  it('searches public communities on the discover tab, after a pause', () => {
    const page = create().componentInstance;

    page.select('discover');
    vi.advanceTimersByTime(300);

    expect(communities.discover).toHaveBeenCalledWith('', undefined);
    expect(page.discovered().length).toBe(2);
  });

  it('offers the interests on screen as filters, most frequent first, and toggles one', () => {
    const page = create().componentInstance;
    page.select('discover');
    vi.advanceTimersByTime(300);

    expect(page.interests()).toEqual(['auto', 'rando']);

    page.toggleInterest('rando');
    vi.advanceTimersByTime(300);
    expect(communities.discover).toHaveBeenLastCalledWith('', 'rando');

    page.toggleInterest('rando');
    vi.advanceTimersByTime(300);
    expect(page.interest()).toBeNull();
  });

  it('keeps a selected interest among the filters even when no result carries it', () => {
    const page = create().componentInstance;
    communities.discover.mockReturnValue(of([]));
    page.toggleInterest('vélo');
    vi.advanceTimersByTime(300);

    expect(page.interests()).toEqual(['vélo']);
  });

  it('searches as the query changes', () => {
    const page = create().componentInstance;

    page.onQuery('club');
    vi.advanceTimersByTime(300);

    expect(communities.discover).toHaveBeenCalledWith('club', undefined);
  });

  it('shows an error and retries the current tab', () => {
    communities.mine.mockReturnValueOnce(throwError(() => new Error('down')));
    const page = create().componentInstance;
    expect(page.error()).toBe(true);

    page.retry();

    expect(page.error()).toBe(false);
    expect(communities.mine).toHaveBeenCalledTimes(2);
  });

  it('reports a failed search', () => {
    communities.discover.mockReturnValue(throwError(() => new Error('down')));
    const page = create().componentInstance;

    page.select('discover');
    vi.advanceTimersByTime(300);

    expect(page.error()).toBe(true);
  });

  it('goes to a community once created', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    dialog.open.mockReturnValue({ afterClosed: () => of(community('new')) });

    create().componentInstance.create();

    expect(navigate).toHaveBeenCalledWith(['/communities', 'new']);
  });

  it('stays put when the creation is cancelled', () => {
    const navigate = vi.spyOn(router, 'navigate');
    dialog.open.mockReturnValue({ afterClosed: () => of(undefined) });

    create().componentInstance.create();

    expect(navigate).not.toHaveBeenCalled();
  });
});
