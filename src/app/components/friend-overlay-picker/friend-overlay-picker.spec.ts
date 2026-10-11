import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FriendOverlayPickerComponent } from './friend-overlay-picker';
import { FriendSummary } from '../../models/friendship.model';

describe('FriendOverlayPickerComponent', () => {
    let fixture: ComponentFixture<FriendOverlayPickerComponent>;
    let component: FriendOverlayPickerComponent;
    const lea: FriendSummary = { userId: 'lea', userName: 'lea', hashtag: 6000, closeness: 'INTIMATE', proposal: null, proposedByFriend: false };

    beforeEach(async () => {
        await TestBed.configureTestingModule({ imports: [FriendOverlayPickerComponent] }).compileComponents();
        fixture = TestBed.createComponent(FriendOverlayPickerComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('friendships', [lea]);
        fixture.detectChanges();
        await fixture.whenStable();
    });

    it('template_shouldListEachFriendWithTheCloseness', () => {
        const options = Array.from(fixture.nativeElement.querySelectorAll('option')) as HTMLOptionElement[];

        expect(options.map(option => option.textContent?.trim())).toEqual(['Superposer un ami…', 'lea · Intime']);
    });

    it('closenessLabel_shouldNameTheLevel', () => {
        expect(component.closenessLabel(lea)).toBe('Intime');
    });

    it('selectedChange_shouldEmitThePickedFriend', () => {
        const emit = vi.spyOn(component.selectedChange, 'emit');
        const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;

        select.selectedIndex = 1;
        select.dispatchEvent(new Event('change'));

        expect(emit).toHaveBeenCalledWith('lea');
    });
});
