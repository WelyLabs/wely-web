import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FriendOverlayBarComponent } from './friend-overlay-bar';
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
