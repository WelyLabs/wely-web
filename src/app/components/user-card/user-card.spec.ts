import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserCardComponent } from './user-card';
import { UserWithStatusDTO } from '../../models/user.model';
import { FriendSummary } from '../../models/friendship.model';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';

describe('UserCardComponent', () => {
    let component: UserCardComponent;
    let fixture: ComponentFixture<UserCardComponent>;
    const mockUser: UserWithStatusDTO = {
        userId: 'user-1',
        userName: 'testuser',
        profilePicUrl: '',
        relationStatus: 'NONE'
    };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [UserCardComponent, MatIconModule, MatButtonModule, MatMenuModule]
        }).compileComponents();

        fixture = TestBed.createComponent(UserCardComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('user', mockUser);
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('metAt_shouldShowWhereTheTwoMet', () => {
        fixture.componentRef.setInput('metAt', 'Soirée jeux');
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('.met-at')?.textContent).toContain('Vous étiez à « Soirée jeux »');
    });

    it('metAt_shouldShowNothingWithoutAnEvent', () => {
        expect(fixture.nativeElement.querySelector('.met-at')).toBeNull();
    });

    it('should derive initials from the user name', () => {
        expect(component.initials()).toBe('TE');
    });

    it('should fall back to U when the user name is empty', () => {
        fixture.componentRef.setInput('user', { ...mockUser, userName: '' });
        expect(component.initials()).toBe('U');
    });

    it('should recompute initials when the user input changes', () => {
        // The point of a computed over a template method call: it tracks the input rather than
        // being re-evaluated on every change-detection pass.
        fixture.componentRef.setInput('user', { ...mockUser, userName: 'alice' });
        expect(component.initials()).toBe('AL');
    });

    it('should show the friend badge by default', () => {
        expect(component.showFriendBadge()).toBe(true);
    });

    it('should emit addFriend when onAddClick is called', () => {
        const emitSpy = vi.spyOn(component.addFriend, 'emit');
        component.onAddClick();
        expect(emitSpy).toHaveBeenCalledWith(mockUser);
    });

    it('should emit chat when onChatClick is called', () => {
        const emitSpy = vi.spyOn(component.chat, 'emit');
        component.onChatClick();
        expect(emitSpy).toHaveBeenCalledWith(mockUser);
    });

    it('should emit acceptFriend when onAcceptClick is called', () => {
        const emitSpy = vi.spyOn(component.acceptFriend, 'emit');
        component.onAcceptClick();
        expect(emitSpy).toHaveBeenCalledWith(mockUser);
    });

    it('should emit declineFriend when onDeclineClick is called', () => {
        const emitSpy = vi.spyOn(component.declineFriend, 'emit');
        component.onDeclineClick();
        expect(emitSpy).toHaveBeenCalledWith(mockUser);
    });

    it('should emit removeFriend when onRemoveFriendClick is called', () => {
        const emitSpy = vi.spyOn(component.removeFriend, 'emit');
        component.onRemoveFriendClick();
        expect(emitSpy).toHaveBeenCalledWith(mockUser);
    });

    describe('closeness', () => {
        const friend: UserWithStatusDTO = { ...mockUser, relationStatus: 'FRIENDS' };
        const friendship = (overrides: Partial<FriendSummary> = {}): FriendSummary => ({
            userId: 'user-1', userName: 'testuser', hashtag: 1234,
            closeness: 'FRIEND', proposal: null, proposedByFriend: false, ...overrides
        });

        beforeEach(() => {
            fixture.componentRef.setInput('user', friend);
        });

        it('closenessLabel_shouldBeNull_withoutAFriendship', () => {
            expect(component.closenessLabel()).toBeNull();
            expect(component.closenessOptions()).toEqual([]);
        });

        it('closenessLabel_shouldNameTheLevel', () => {
            fixture.componentRef.setInput('friendship', friendship({ closeness: 'CLOSE' }));
            fixture.detectChanges();

            expect(component.closenessLabel()).toBe('Proche');
            expect(fixture.nativeElement.querySelector('.closeness-badge').textContent).toContain('Proche');
        });

        it('closenessOptions_shouldProposeHigherLevelsAndStepDownToLowerOnes', () => {
            fixture.componentRef.setInput('friendship', friendship({ closeness: 'CLOSE' }));

            expect(component.closenessOptions().map(o => o.label)).toEqual(['Redescendre à Ami', 'Proposer : Intime']);
        });

        it('closenessOptions_shouldLeaveOutWhatIAlreadyProposed', () => {
            fixture.componentRef.setInput('friendship', friendship({ proposal: 'INTIMATE' }));

            expect(component.closenessOptions().map(o => o.closeness)).toEqual(['CLOSE']);
        });

        it('incomingProposal_shouldShowWhatTheFriendProposed', () => {
            fixture.componentRef.setInput('friendship', friendship({ proposal: 'INTIMATE', proposedByFriend: true }));
            fixture.detectChanges();

            expect(component.incomingProposal()).toBe('Intime');
            expect(component.outgoingProposal()).toBeNull();
            expect(fixture.nativeElement.querySelector('.closeness-proposal').textContent).toContain('Intime');
        });

        it('outgoingProposal_shouldShowWhatIProposed', () => {
            fixture.componentRef.setInput('friendship', friendship({ proposal: 'CLOSE' }));
            fixture.detectChanges();

            expect(component.outgoingProposal()).toBe('Proche');
            expect(component.incomingProposal()).toBeNull();
            expect(fixture.nativeElement.textContent).toContain('en attente');
        });

        it('onClosenessClick_shouldEmitTheRequestedLevel', () => {
            const emit = vi.spyOn(component.closenessChange, 'emit');

            component.onClosenessClick('INTIMATE');

            expect(emit).toHaveBeenCalledWith({ user: friend, closeness: 'INTIMATE' });
        });

        it('onWithdrawProposalClick_shouldAskForTheCurrentLevel', () => {
            fixture.componentRef.setInput('friendship', friendship({ closeness: 'CLOSE', proposal: 'INTIMATE' }));
            const emit = vi.spyOn(component.closenessChange, 'emit');

            component.onWithdrawProposalClick();

            expect(emit).toHaveBeenCalledWith({ user: friend, closeness: 'CLOSE' });
        });

        it('onWithdrawProposalClick_shouldDoNothing_withoutAFriendship', () => {
            const emit = vi.spyOn(component.closenessChange, 'emit');

            component.onWithdrawProposalClick();

            expect(emit).not.toHaveBeenCalled();
        });

        it('onAnswerClick_shouldEmitTheAnswer', () => {
            const emit = vi.spyOn(component.closenessAnswer, 'emit');

            component.onAnswerClick(true);

            expect(emit).toHaveBeenCalledWith({ user: friend, accept: true });
        });
    });
});
