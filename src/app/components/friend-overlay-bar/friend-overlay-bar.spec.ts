import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FriendOverlayBarComponent, circleColor } from './friend-overlay-bar';
import { FriendSummary } from '../../models/friendship.model';
import { MAX_OVERLAID_FRIENDS } from '../calendar-overlay/overlay-layout';

describe('FriendOverlayBarComponent', () => {
    let fixture: ComponentFixture<FriendOverlayBarComponent>;
    let component: FriendOverlayBarComponent;
    const lea: FriendSummary = { userId: 'lea', userName: 'lea', hashtag: 6000, closeness: 'INTIMATE', proposal: null, proposedByFriend: false };
    const hugo: FriendSummary = { userId: 'hugo', userName: 'hugo', hashtag: 9074, closeness: 'CLOSE', proposal: null, proposedByFriend: false };

    beforeEach(async () => {
        await TestBed.configureTestingModule({ imports: [FriendOverlayBarComponent] }).compileComponents();
        fixture = TestBed.createComponent(FriendOverlayBarComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('friendships', [lea, hugo]);
        fixture.detectChanges();
    });

    it('circle_shouldOfferTheToggle_withAnIntimateFriend', () => {
        const emitted: boolean[] = [];
        component.circleChange.subscribe(value => emitted.push(value));
        const toggle = fixture.nativeElement.querySelector('.circle-toggle') as HTMLButtonElement;

        expect(toggle.textContent).toContain('Mon cercle');
        expect(toggle.getAttribute('aria-pressed')).toBe('false');
        toggle.click();
        fixture.componentRef.setInput('circle', true);
        fixture.detectChanges();
        toggle.click();

        expect(emitted).toEqual([true, false]);
        expect(toggle.classList).toContain('on');
    });

    it('circle_shouldListTheIntimatesInTheirColours_whenOn', () => {
        fixture.componentRef.setInput('circle', true);
        fixture.detectChanges();

        const legend = fixture.nativeElement.querySelector('.circle-legend') as HTMLElement;
        expect(component.intimates().map(member => member.userId)).toEqual(['lea']);
        expect(legend.textContent).toContain('lea');
        expect(legend.textContent).not.toContain('hugo');
        expect(component.intimates()[0].color).toBe(circleColor('lea'));
    });

    it('circle_shouldHideTheToggle_withoutAnIntimateFriend', () => {
        fixture.componentRef.setInput('friendships', [hugo]);
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('.circle-toggle')).toBeNull();
    });

    it('legend_shouldBeEmpty_whenNobodyIsOverlaid', () => {
        expect(component.legend()).toEqual([]);
        expect(fixture.nativeElement.querySelector('.legend')).toBeNull();
    });

    it('legend_shouldListOverlaidFriendsInOrderWithTheirColourAndCloseness', () => {
        fixture.componentRef.setInput('selected', ['hugo', 'lea']);
        fixture.componentRef.setInput('colors', new Map([['hugo', '#a855f7'], ['lea', '#f97316']]));
        fixture.detectChanges();

        expect(component.legend().map(entry => [entry.userName, entry.color, entry.closeness])).toEqual([
            ['hugo', '#a855f7', 'Proche'],
            ['lea', '#f97316', 'Intime']
        ]);
        expect(fixture.nativeElement.querySelector('.legend').textContent).toContain('Vous êtes tous libres');
    });

    it('legend_shouldSkipAnIdThatIsNoLongerAFriend', () => {
        fixture.componentRef.setInput('selected', ['gone']);

        expect(component.legend()).toEqual([]);
    });

    it('max_shouldBeTheOverlayLimit', () => {
        expect(component.max).toBe(MAX_OVERLAID_FRIENDS);
    });

    it('selectedChange_shouldPassOnTheMentionFieldsSelection', () => {
        const emit = vi.spyOn(component.selectedChange, 'emit');
        fixture.componentRef.setInput('selected', ['lea']);
        fixture.detectChanges();

        (fixture.nativeElement.querySelector('.mention-remove') as HTMLButtonElement).click();

        expect(emit).toHaveBeenCalledWith([]);
    });

    it('template_shouldShowTheError', () => {
        fixture.componentRef.setInput('error', 'Impossible de charger le calendrier de lea.');
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('.error').textContent).toContain('lea');
    });
});
