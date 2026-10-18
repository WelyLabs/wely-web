import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { FriendsGoingComponent } from './friends-going';
import { AvatarService } from '../../services/avatar.service';
import { FeedEvent } from '../../services/event.service';

describe('FriendsGoingComponent', () => {
    let fixture: ComponentFixture<FriendsGoingComponent>;

    const event = (overrides: Partial<FeedEvent> = {}): FeedEvent => ({
        id: 'e1', title: 'Concert', organizerId: 'org', startDate: new Date(), endDate: new Date(), location: 'Zénith',
        image: null, description: '', ...overrides
    });

    const render = (value: FeedEvent, names: ReadonlyMap<string, string> = new Map()) => {
        fixture = TestBed.createComponent(FriendsGoingComponent);
        fixture.componentRef.setInput('event', value);
        fixture.componentRef.setInput('names', names);
        fixture.detectChanges();
    };
    const text = () => (fixture.nativeElement.textContent as string).trim();

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [FriendsGoingComponent],
            providers: [{ provide: AvatarService, useValue: { url: (id: string) => signal(id === 'lea' ? '/lea.jpg' : null) } }]
        }).compileComponents();
    });

    it('template_shouldStackUpToThreeFriends_andCountTheClosest', () => {
        render(event({
            friendsGoing: [
                { userId: 'lea', closeness: 'INTIMATE' }, { userId: 'hugo', closeness: 'CLOSE' },
                { userId: 'max', closeness: 'CLOSE' }, { userId: 'zoe', closeness: 'FRIEND' }
            ],
            friendsGoingCount: 7
        }), new Map([['hugo', 'Hugo Petit']]));

        expect(text()).toContain('3 de tes proches y vont');
        expect(fixture.nativeElement.querySelectorAll('.avatar')).toHaveLength(3);
        expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe('/lea.jpg');
        expect(text()).toContain('HP');
    });

    it('template_shouldCountEveryFriend_whenNoneIsClose', () => {
        render(event({ friendsGoing: [{ userId: 'zoe', closeness: 'FRIEND' }], friendsGoingCount: 4 }));

        expect(text()).toContain('4 amis y vont');
    });

    it('template_shouldShowNothing_whenNoFriendGoes', () => {
        render(event());

        expect(fixture.nativeElement.querySelector('.friends-going')).toBeNull();
    });
});
