import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SharedChatComponent } from './shared-chat';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('SharedChatComponent', () => {
    let component: SharedChatComponent;
    let fixture: ComponentFixture<SharedChatComponent>;

    /** Fires the IntersectionObserver the component registered, as the browser would. */
    let observerCallback: (entries: IntersectionObserverEntry[]) => void;

    beforeEach(async () => {
        const MockIntersectionObserver = class {
            constructor(public callback: (entries: IntersectionObserverEntry[]) => void) {
                observerCallback = callback;
            }
            observe = vi.fn();
            unobserve = vi.fn();
            disconnect = vi.fn();
            root = null;
            rootMargin = '';
            thresholds = [];
            takeRecords = vi.fn();
        };
        vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

        await TestBed.configureTestingModule({
            imports: [
                SharedChatComponent,
                FormsModule,
                MatIconModule,
                MatButtonModule,
                MatInputModule,
                MatFormFieldModule,
                NoopAnimationsModule
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(SharedChatComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should emit onSend when sendMessage is called with content', () => {
        const emitSpy = vi.spyOn(component.send, 'emit');
        component.newMessage.set('Hello world');
        component.sendMessage();
        expect(emitSpy).toHaveBeenCalledWith('Hello world');
        expect(component.newMessage()).toBe('');
    });

    it('should not emit onSend when sendMessage is called with empty content', () => {
        const emitSpy = vi.spyOn(component.send, 'emit');
        component.newMessage.set('  ');
        component.sendMessage();
        expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should send the trimmed text, not what was typed around it', () => {
        const emitSpy = vi.spyOn(component.send, 'emit');
        component.newMessage.set('  Hello  ');

        component.sendMessage();

        expect(emitSpy).toHaveBeenCalledWith('Hello');
    });

    it('should track an optimistic message by position until it has an id', () => {
        // A message the user has just sent carries no server id, so falling back to the index is
        // what keeps @for from re-creating every row around it.
        expect(component.trackByMessage(3, { text: 'x', isMe: true, time: new Date() })).toBe(3);
        expect(component.trackByMessage(3, { id: 'm-1', text: 'x', isMe: true, time: new Date() }))
            .toBe('m-1');
    });

    it('should expose the default input values the parent may omit', () => {
        expect(component.messages()).toEqual([]);
        expect(component.loading()).toBe(false);
        expect(component.historyLoading()).toBe(false);
        expect(component.hasMore()).toBe(true);
        expect(component.placeholder()).toBe('Type a message...');
    });

    it('should ask for more history when the top sentinel comes into view', () => {
        const emitSpy = vi.spyOn(component.loadMore, 'emit');
        fixture.componentRef.setInput('hasMore', true);
        fixture.componentRef.setInput('historyLoading', false);
        fixture.detectChanges();

        observerCallback([{ isIntersecting: true } as IntersectionObserverEntry]);

        expect(emitSpy).toHaveBeenCalled();
    });

    it('should not ask for more history while a load is already running', () => {
        const emitSpy = vi.spyOn(component.loadMore, 'emit');
        fixture.componentRef.setInput('historyLoading', true);
        fixture.detectChanges();

        observerCallback([{ isIntersecting: true } as IntersectionObserverEntry]);

        expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should not ask for more history when there is none left', () => {
        const emitSpy = vi.spyOn(component.loadMore, 'emit');
        fixture.componentRef.setInput('hasMore', false);
        fixture.detectChanges();

        observerCallback([{ isIntersecting: true } as IntersectionObserverEntry]);

        expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should ask only once until the load it triggered has finished', () => {
        const emitSpy = vi.spyOn(component.loadMore, 'emit');
        fixture.detectChanges();

        observerCallback([{ isIntersecting: true } as IntersectionObserverEntry]);
        observerCallback([{ isIntersecting: true } as IntersectionObserverEntry]);

        expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    it('should re-arm the trigger after a cool-down once loading finishes', () => {
        vi.useFakeTimers();
        const emitSpy = vi.spyOn(component.loadMore, 'emit');
        fixture.detectChanges();
        observerCallback([{ isIntersecting: true } as IntersectionObserverEntry]);
        expect(emitSpy).toHaveBeenCalledTimes(1);

        // The cool-down exists to stop the sentinel firing again the instant the batch lands,
        // before the reader's scroll position has been restored.
        component.ngOnChanges({
            historyLoading: {
                currentValue: false,
                previousValue: true,
                firstChange: false,
                isFirstChange: () => false
            }
        });
        vi.advanceTimersByTime(700);

        observerCallback([{ isIntersecting: true } as IntersectionObserverEntry]);

        expect(emitSpy).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });

    it('should scroll to bottom when messages initially load', () => {
        const scrollSpy = vi.spyOn(component as any, 'scrollToBottom');
        component.ngOnChanges({
            messages: {
                currentValue: [{ text: 'hi', isMe: true, time: new Date() }],
                previousValue: undefined,
                firstChange: true,
                isFirstChange: () => true
            }
        });

        component.ngAfterViewChecked();
        expect(scrollSpy).toHaveBeenCalled();
    });

    it('should preserve scroll when messages are prepended', () => {
        const preserveSpy = vi.spyOn(component as any, 'preserveScroll').mockImplementation(() => undefined);
        const oldMsgs = [{ text: 'old', isMe: false, time: new Date() }];
        const newMsgs = [{ text: 'new', isMe: false, time: new Date() }, ...oldMsgs];

        component.ngOnChanges({
            messages: {
                currentValue: newMsgs,
                previousValue: oldMsgs,
                firstChange: false,
                isFirstChange: () => false
            }
        });

        component.ngAfterViewChecked();
        expect(preserveSpy).toHaveBeenCalled();
    });
});
