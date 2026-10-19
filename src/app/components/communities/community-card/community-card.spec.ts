import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { CommunityCardComponent } from './community-card';
import { Community } from '../../../models/community.model';

const community = (overrides: Partial<Community> = {}): Community => ({
  communityId: 'c1',
  name: 'Club Auto',
  description: 'Voitures anciennes',
  interests: ['auto'],
  visibility: 'PUBLIC',
  createdAt: '2026-10-01T10:00:00Z',
  memberCount: 3,
  role: null,
  friendMembers: [],
  friendMemberCount: 0,
  pictureUrl: null,
  ...overrides,
});

function render(value: Community) {
  TestBed.configureTestingModule({ imports: [CommunityCardComponent], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(CommunityCardComponent);
  fixture.componentRef.setInput('community', value);
  fixture.detectChanges();
  return fixture;
}

describe('CommunityCardComponent', () => {
  it('shows the community and links to its page', () => {
    const fixture = render(community());
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('h3')?.textContent).toContain('Club Auto');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/communities/c1');
    expect(el.textContent).toContain('Publique');
    expect(el.textContent).toContain('3 membres');
    expect(el.textContent).toContain('#auto');
    expect(fixture.componentInstance.initials()).toBe('CA');
  });

  it('marks a private community and the viewer\'s role', () => {
    const el: HTMLElement = render(community({ visibility: 'PRIVATE', role: 'ADMIN', memberCount: 1 })).nativeElement;

    expect(el.textContent).toContain('Privée');
    expect(el.textContent).toContain('1 membre');
    expect(el.querySelector('.role-pill')?.textContent).toContain('Admin');
  });

  it('names no friend when none is a member', () => {
    expect(render(community()).componentInstance.friendsLabel()).toBeNull();
  });

  it('names two friends at most, then how many more', () => {
    const friends = ['lea', 'hugo', 'ines'].map((userName) => ({ userId: userName, userName, hashtag: 1 }));

    expect(render(community({ friendMembers: friends.slice(0, 1), friendMemberCount: 1 })).componentInstance.friendsLabel())
      .toBe('lea');
    TestBed.resetTestingModule();
    expect(render(community({ friendMembers: friends, friendMemberCount: 3 })).componentInstance.friendsLabel())
      .toBe('lea, hugo et 1 autre ami');
    TestBed.resetTestingModule();
    expect(render(community({ friendMembers: friends, friendMemberCount: 6 })).componentInstance.friendsLabel())
      .toBe('lea, hugo et 4 autres amis');
  });

  it('shows a member pill for a plain member', () => {
    expect(render(community({ role: 'MEMBER' })).nativeElement.querySelector('.role-pill.member')).toBeTruthy();
  });

  it('shows the community\'s picture instead of its initials', () => {
    const el: HTMLElement = render(community({ pictureUrl: 'https://media/c1.jpg' })).nativeElement;

    expect(el.querySelector('img.badge-avatar')?.getAttribute('src')).toBe('https://media/c1.jpg');
    expect(el.querySelector('span.badge-avatar')).toBeNull();
  });

  it('shows the initials without a picture', () => {
    const el: HTMLElement = render(community()).nativeElement;

    expect(el.querySelector('span.badge-avatar')?.textContent).toContain('CA');
    expect(el.querySelector('img.badge-avatar')).toBeNull();
  });
});
