import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReunionCardComponent } from './reunion-card';
import { AvatarService } from '../../services/avatar.service';
import { FriendshipInsightsService } from '../../services/friendship-insights.service';
import { ReunionCandidate } from '../../models/friendship-insights.model';

describe('ReunionCardComponent', () => {
    let fixture: ComponentFixture<ReunionCardComponent>;
    let component: ReunionCardComponent;
    let insights: { getReunions: ReturnType<typeof vi.fn>; dismissReunion: ReturnType<typeof vi.fn> };
    let router: { navigate: ReturnType<typeof vi.fn> };

    const candidate = (friendId: string, overrides: Partial<ReunionCandidate> = {}): ReunionCandidate => ({
        friendId, name: friendId === 'hugo' ? 'Hugo' : 'Léa', closeness: 'CLOSE', lastSharedAt: '2026-06-01T19:00:00Z',
        lastSharedEventId: 'e1', lastSharedTitle: 'Ciné', monthsApart: 4, ...overrides
    });

    const create = () => {
        fixture = TestBed.createComponent(ReunionCardComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    };
    const text = () => fixture.nativeElement.textContent as string;
    const buttons = (label: string) => ([...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[])
        .filter(button => button.textContent?.includes(label));

    beforeEach(async () => {
        insights = {
            getReunions: vi.fn().mockReturnValue(of([candidate('hugo'), candidate('lea', { closeness: 'INTIMATE' })])),
            dismissReunion: vi.fn().mockReturnValue(of(undefined))
        };
        router = { navigate: vi.fn().mockResolvedValue(true) };
        await TestBed.configureTestingModule({
            imports: [ReunionCardComponent],
            providers: [
                { provide: FriendshipInsightsService, useValue: insights },
                { provide: Router, useValue: router },
                { provide: AvatarService, useValue: { url: () => signal(null) } }
            ]
        }).compileComponents();
    });

    it('template_shouldListTheFriendsNotSeenForAWhile', () => {
        create();

        expect(text()).toContain('Ça fait longtemps');
        expect(text()).toContain('Hugo');
        expect(text()).toContain('Pas vus depuis 4 mois · Ciné');
        expect(text()).toContain('Intime');
    });

    it('template_shouldShowNothing_whenNoOneIsSuggested', () => {
        insights.getReunions.mockReturnValue(of([]));
        create();

        expect(fixture.nativeElement.querySelector('.reunion-card')).toBeNull();
    });

    it('template_shouldShowNothing_whenTheSuggestionsCannotBeRead', () => {
        insights.getReunions.mockReturnValue(throwError(() => new Error('down')));
        create();

        expect(fixture.nativeElement.querySelector('.reunion-card')).toBeNull();
    });

    it('propose_shouldOpenTheFriendPagesProposal', () => {
        create();

        buttons('Proposer une sortie')[0].click();

        expect(router.navigate).toHaveBeenCalledWith(['/friends', 'hugo'], { queryParams: { propose: 1 } });
    });

    it('later_shouldSnoozeTheFriend_andTakeThemOff', () => {
        create();

        buttons('Plus tard')[0].click();
        fixture.detectChanges();

        expect(insights.dismissReunion).toHaveBeenCalledWith('hugo');
        expect(component.candidates().map(other => other.friendId)).toEqual(['lea']);
        expect(text()).not.toContain('Hugo');
    });

    it('later_shouldPutTheFriendBack_whenTheSnoozeFails', () => {
        insights.dismissReunion.mockReturnValue(throwError(() => new Error('down')));
        create();

        component.later(component.candidates()[0]);

        expect(component.candidates().map(other => other.friendId)).toEqual(['lea', 'hugo']);
    });
});
