import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { FriendMentionInputComponent, MentionableFriend } from './friend-mention-input';

describe('FriendMentionInputComponent', () => {
    let fixture: ComponentFixture<FriendMentionInputComponent>;
    let component: FriendMentionInputComponent;
    let emitted: string[][];

    const alice: MentionableFriend = { userId: 'u-1', userName: 'Alice', hashtag: 1 };
    const zoe: MentionableFriend = { userId: 'u-2', userName: 'Zoé', hashtag: 2 };
    const key = (name: string) => new KeyboardEvent('keydown', { key: name, cancelable: true });

    /** The parent owns the selection: feed each emission back, as a parent would. */
    const select = (ids: string[]) => {
        fixture.componentRef.setInput('selected', ids);
        fixture.detectChanges();
    };

    beforeEach(async () => {
        await TestBed.configureTestingModule({ imports: [FriendMentionInputComponent] }).compileComponents();
        fixture = TestBed.createComponent(FriendMentionInputComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('friends', [alice, zoe]);
        emitted = [];
        component.selectedChange.subscribe(ids => {
            emitted.push(ids);
            select(ids);
        });
        fixture.detectChanges();
    });

    it('suggestions_shouldBeEmpty_whenNothingIsTyped', () => {
        expect(component.suggestions()).toEqual([]);
    });

    it('suggestions_shouldListEveryFriend_whenOnlyTheAtIsTyped', () => {
        component.query.set('@');

        expect(component.suggestions()).toEqual([alice, zoe]);
    });

    it('suggestions_shouldMatchTheNameCaseInsensitively_withOrWithoutTheAt', () => {
        component.query.set('@ali');
        expect(component.suggestions()).toEqual([alice]);

        component.query.set('ZO');
        expect(component.suggestions()).toEqual([zoe]);
    });

    it('suggestions_shouldMatchTheHashtag', () => {
        component.query.set('@#2');

        expect(component.suggestions()).toEqual([zoe]);
    });

    it('suggestions_shouldLeaveOutFriendsAlreadyMentioned', () => {
        select(['u-1']);
        component.query.set('@');

        expect(component.suggestions()).toEqual([zoe]);
    });

    it('suggestions_shouldShowAtMostSix', () => {
        fixture.componentRef.setInput('friends',
            Array.from({ length: 10 }, (_, i) => ({ userId: `f-${i}`, userName: `Friend ${i}`, hashtag: i })));
        component.query.set('@friend');

        expect(component.suggestions()).toHaveLength(6);
    });

    it('suggestions_shouldStop_whenTheMaximumIsReached', () => {
        fixture.componentRef.setInput('max', 1);
        select(['u-1']);
        component.query.set('@');

        expect(component.full()).toBe(true);
        expect(component.suggestions()).toEqual([]);
    });

    it('mention_shouldAppendTheFriendAndClearTheField', () => {
        select(['u-2']);
        component.query.set('@ali');

        component.mention(alice);

        expect(emitted.at(-1)).toEqual(['u-2', 'u-1']);
        expect(component.query()).toBe('');
    });

    it('mention_shouldIgnoreAFriendAlreadyMentioned', () => {
        select(['u-1']);

        component.mention(alice);

        expect(emitted).toEqual([]);
    });

    it('mention_shouldIgnoreAnyoneOverTheMaximum', () => {
        fixture.componentRef.setInput('max', 1);
        select(['u-1']);

        component.mention(zoe);

        expect(emitted).toEqual([]);
    });

    it('selectedFriends_shouldKeepTheOrderOfMention', () => {
        select(['u-2', 'u-1']);

        expect(component.selectedFriends()).toEqual([zoe, alice]);
    });

    it('remove_shouldDropTheMention', () => {
        select(['u-1', 'u-2']);

        component.remove('u-1');

        expect(emitted.at(-1)).toEqual(['u-2']);
    });

    it('tagOf_shouldJoinNameAndHashtag', () => {
        expect(component.tagOf(alice)).toBe('Alice#1');
    });

    it('colorOf_shouldGiveTheChipItsFriendsColour', () => {
        fixture.componentRef.setInput('colors', new Map([['u-1', '#a855f7']]));
        select(['u-1']);

        expect(component.colorOf('u-1')).toBe('#a855f7');
        expect(component.colorOf('u-2')).toBeNull();
        expect((fixture.nativeElement.querySelector('.mention') as HTMLElement).classList).toContain('colored');
    });

    it('onQueryKeydown_shouldMentionTheActiveSuggestionOnEnter', () => {
        component.query.set('@');
        const enter = key('Enter');

        component.onQueryKeydown(enter);

        expect(emitted.at(-1)).toEqual(['u-1']);
        expect(enter.defaultPrevented).toBe(true);
    });

    it('onQueryKeydown_shouldMoveThroughSuggestionsWithTheArrowsAndWrapAround', () => {
        component.query.set('@');

        component.onQueryKeydown(key('ArrowDown'));
        expect(component.activeIndex()).toBe(1);
        component.onQueryKeydown(key('ArrowDown'));
        expect(component.activeIndex()).toBe(0);
        component.onQueryKeydown(key('ArrowUp'));
        expect(component.activeIndex()).toBe(1);

        component.onQueryKeydown(key('Enter'));
        expect(emitted.at(-1)).toEqual(['u-2']);
    });

    it('onQueryKeydown_shouldGoBackToTheFirstSuggestion_whenTheQueryChanges', () => {
        component.query.set('@');
        component.onQueryKeydown(key('ArrowDown'));

        component.query.set('@a');

        expect(component.activeIndex()).toBe(0);
    });

    it('onQueryKeydown_shouldLetEnterThrough_whenThereIsNoSuggestion', () => {
        const enter = key('Enter');

        component.onQueryKeydown(enter);

        expect(enter.defaultPrevented).toBe(false);
        expect(emitted).toEqual([]);
    });

    it('onQueryKeydown_shouldClearTheFieldOnEscape', () => {
        component.query.set('@ali');

        component.onQueryKeydown(key('Escape'));

        expect(component.query()).toBe('');
    });

    it('onQueryKeydown_shouldDropTheLastMentionOnBackspace_whenTheFieldIsEmpty', () => {
        select(['u-2', 'u-1']);

        component.onQueryKeydown(key('Backspace'));

        expect(emitted.at(-1)).toEqual(['u-2']);
    });

    it('onQueryKeydown_shouldKeepMentionsOnBackspace_whileTextIsTyped', () => {
        select(['u-1']);
        component.query.set('@z');

        component.onQueryKeydown(key('Backspace'));

        expect(emitted).toEqual([]);
    });

    it('template_shouldRenderMentionsAndSuggestions', () => {
        select(['u-1']);
        component.query.set('@z');
        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain('@Alice');
        expect(fixture.nativeElement.querySelectorAll('.suggestions li')).toHaveLength(1);
    });

    it('template_shouldPickASuggestionOnMouseDown', () => {
        component.query.set('@z');
        fixture.detectChanges();

        (fixture.nativeElement.querySelector('.suggestions li') as HTMLElement)
            .dispatchEvent(new MouseEvent('mousedown', { cancelable: true }));

        expect(emitted.at(-1)).toEqual(['u-2']);
    });

    it('template_shouldSayWhenNoFriendMatches', () => {
        component.query.set('@nobody');
        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain('Aucun ami ne correspond');
    });
});
