import { Component, EventEmitter, Input, Output, ViewChild, ElementRef, AfterViewChecked, OnChanges, SimpleChanges, AfterViewInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

export interface ChatMessage {
    id?: string;
    text: string;
    time: Date | string;
    isMe: boolean;
    senderName?: string;
    animationDelay?: string;
}

@Component({
    selector: 'app-shared-chat',
    standalone: true,
    imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule],
    templateUrl: './shared-chat.html',
    styleUrl: './shared-chat.scss'
})
export class SharedChatComponent implements AfterViewChecked, OnChanges, AfterViewInit, OnDestroy {
    @Input() messages: ChatMessage[] = [];
    @Input() placeholder: string = 'Type a message...';
    @Input() loading: boolean = false;
    @Input() historyLoading: boolean = false;
    @Input() hasMore: boolean = true;
    @Output() onSend = new EventEmitter<string>();
    @Output() onLoadMore = new EventEmitter<void>();

    @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
    @ViewChild('topSentinel') private topSentinel!: ElementRef;

    newMessage: string = '';
    private shouldScrollToBottom = false;
    private shouldPreserveScroll = false;
    private previousScrollHeight = 0;
    private previousScrollTop = 0;
    private allowTrigger = true;
    private observer?: IntersectionObserver;

    constructor(private ngZone: NgZone) { }

    ngAfterViewInit() {
        this.setupIntersectionObserver();
    }

    ngOnDestroy() {
        this.observer?.disconnect();
    }

    private setupIntersectionObserver() {
        const options = {
            root: this.scrollContainer.nativeElement,
            threshold: 0
        };

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && this.allowTrigger && this.hasMore && !this.historyLoading) {
                    console.log('🚀 [SharedChat] Sentinel visible - Triggering LOAD MORE');
                    this.onLoadMore.emit();
                    this.allowTrigger = false; // Lock immediately
                }
            });
        }, options);

        if (this.topSentinel) {
            this.observer.observe(this.topSentinel.nativeElement);
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        const historyLoadingChange = changes['historyLoading'];

        // When loading finishes, we can allow the trigger again if it's currently out of view
        // or if reached via a new scroll. But fundamentally, we must wait for the load to finish.
        if (historyLoadingChange && !historyLoadingChange.currentValue && historyLoadingChange.previousValue) {
            // Wait a bit after loading finishes before re-arming to prevent rapid-fire
            setTimeout(() => {
                this.allowTrigger = true;
                console.log('✅ [SharedChat] History load cool-down finished - Unlock trigger');
            }, 600);
        }

        if (changes['messages']) {
            const currentMessages = changes['messages'].currentValue;
            const previousMessages = changes['messages'].previousValue;

            // If we have new messages and we had previous ones
            if (previousMessages && currentMessages && currentMessages.length > previousMessages.length) {
                // Check if prepended (first new message is different from first old message)
                if (currentMessages[0] !== previousMessages[0]) {
                    const scrollEl = this.scrollContainer.nativeElement;
                    this.shouldPreserveScroll = true;
                    this.previousScrollHeight = scrollEl.scrollHeight;
                    this.previousScrollTop = scrollEl.scrollTop;
                } else {
                    this.shouldScrollToBottom = true;
                }
            } else if (!previousMessages && currentMessages) {
                // Initial load
                this.shouldScrollToBottom = true;
            }
        }
    }

    ngAfterViewChecked() {
        if (this.shouldScrollToBottom) {
            this.scrollToBottom();
            this.shouldScrollToBottom = false;
        } else if (this.shouldPreserveScroll) {
            this.preserveScroll();
            this.shouldPreserveScroll = false;
        }
    }

    private preserveScroll(): void {
        const element = this.scrollContainer.nativeElement;

        const originalBehavior = element.style.scrollBehavior;
        element.style.scrollBehavior = 'auto';

        const adjust = () => {
            const newScrollHeight = element.scrollHeight;
            const heightDiff = newScrollHeight - this.previousScrollHeight;
            const targetScrollTop = heightDiff + this.previousScrollTop;

            element.scrollTop = targetScrollTop;

            // Force layout/repaint
            void element.offsetHeight;

            console.log('⚓ [SharedChat] Scroll adjustment:', {
                target: targetScrollTop,
                actual: element.scrollTop,
                heightDiff
            });
        };

        // Immediate attempt
        adjust();

        // Second attempt after 50ms to ensure stability after heavy DOM updates
        setTimeout(() => {
            adjust();
            element.style.scrollBehavior = originalBehavior;
        }, 50);
    }

    private scrollToBottom(): void {
        try {
            const element = this.scrollContainer.nativeElement;
            element.scrollTop = element.scrollHeight;
        } catch (err) { }
    }

    sendMessage() {
        if (this.newMessage.trim()) {
            this.onSend.emit(this.newMessage);
            this.newMessage = '';
            this.shouldScrollToBottom = true;
        }
    }

    trackByMessage(index: number, message: ChatMessage): any {
        return message.id || index;
    }
}
