import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { SharedChatComponent, ChatMessage } from './shared-chat';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('SharedChatComponent', () => {
    let component: SharedChatComponent;
    let fixture: ComponentFixture<SharedChatComponent>;
    let intersectionObserverMock: any;

    beforeEach(async () => {
        const MockIntersectionObserver = class {
            constructor(public callback: any) { }
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
        const emitSpy = vi.spyOn(component.onSend, 'emit');
        component.newMessage = 'Hello world';
        component.sendMessage();
        expect(emitSpy).toHaveBeenCalledWith('Hello world');
        expect(component.newMessage).toBe('');
    });

    it('should not emit onSend when sendMessage is called with empty content', () => {
        const emitSpy = vi.spyOn(component.onSend, 'emit');
        component.newMessage = '  ';
        component.sendMessage();
        expect(emitSpy).not.toHaveBeenCalled();
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
        const preserveSpy = vi.spyOn(component as any, 'preserveScroll').mockImplementation(() => { });
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
