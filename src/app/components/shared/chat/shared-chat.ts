import { AfterViewChecked, AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnChanges, OnDestroy, SimpleChanges, inject, input, output, signal, viewChild } from '@angular/core';
import { LoggerService } from '../../../core/logging/logger.service';
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
    /** Sent, not yet acknowledged by the server. */
    pending?: boolean;
    /** The server refused it, or the connection failed. */
    failed?: boolean;
}

@Component({
    selector: 'app-shared-chat',
    standalone: true,
    imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule],
    templateUrl: './shared-chat.html',
    styleUrl: './shared-chat.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SharedChatComponent implements AfterViewChecked, OnChanges, AfterViewInit, OnDestroy {
    private readonly logger = inject(LoggerService);

    readonly messages = input<ChatMessage[]>([]);
    readonly placeholder = input('Type a message...');
    readonly loading = input(false);
    readonly historyLoading = input(false);
    readonly hasMore = input(true);

    readonly send = output<string>();
    readonly loadMore = output<void>();

    private readonly scrollContainer = viewChild.required<ElementRef<HTMLElement>>('scrollContainer');
    private readonly topSentinel = viewChild<ElementRef<HTMLElement>>('topSentinel');

    readonly newMessage = signal('');
    private shouldScrollToBottom = false;
    private shouldPreserveScroll = false;
    private previousScrollHeight = 0;
    private previousScrollTop = 0;
    private allowTrigger = true;
    private observer?: IntersectionObserver;

    ngAfterViewInit(): void {
        this.setupIntersectionObserver();
    }

    ngOnDestroy(): void {
        this.observer?.disconnect();
    }

    private setupIntersectionObserver(): void {
        const options = {
            root: this.scrollContainer().nativeElement,
            threshold: 0
        };

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && this.allowTrigger && this.hasMore() && !this.historyLoading()) {
                    this.logger.debug('SharedChatComponent', '🚀 [SharedChat] Sentinel visible - Triggering LOAD MORE');
                    this.loadMore.emit();
                    this.allowTrigger = false; // Lock immediately
                }
            });
        }, options);

        const sentinel = this.topSentinel();
        if (sentinel) {
            this.observer.observe(sentinel.nativeElement);
        }
    }

    /**
     * Kept as {@code ngOnChanges}, which still fires for signal inputs, because the scroll
     * anchoring needs the previous value of `messages` as well as the current one: whether a
     * batch was appended or prepended is the difference between following the conversation down
     * and holding the reader's place. A computed cannot see what a value used to be.
     */
    ngOnChanges(changes: SimpleChanges): void {
        const historyLoadingChange = changes['historyLoading'];

        // When loading finishes, we can allow the trigger again if it's currently out of view
        // or if reached via a new scroll. But fundamentally, we must wait for the load to finish.
        if (historyLoadingChange && !historyLoadingChange.currentValue && historyLoadingChange.previousValue) {
            // Wait a bit after loading finishes before re-arming to prevent rapid-fire
            setTimeout(() => {
                this.allowTrigger = true;
                this.logger.debug('SharedChatComponent', '✅ [SharedChat] History load cool-down finished - Unlock trigger');
            }, 600);
        }

        if (changes['messages']) {
            const currentMessages = changes['messages'].currentValue;
            const previousMessages = changes['messages'].previousValue;

            // If we have new messages and we had previous ones
            if (previousMessages && currentMessages && currentMessages.length > previousMessages.length) {
                // Check if prepended (first new message is different from first old message)
                if (currentMessages[0] !== previousMessages[0]) {
                    const scrollEl = this.scrollContainer().nativeElement;
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

    ngAfterViewChecked(): void {
        if (this.shouldScrollToBottom) {
            this.scrollToBottom();
            this.shouldScrollToBottom = false;
        } else if (this.shouldPreserveScroll) {
            this.preserveScroll();
            this.shouldPreserveScroll = false;
        }
    }

    private preserveScroll(): void {
        const element = this.scrollContainer().nativeElement;

        const originalBehavior = element.style.scrollBehavior;
        element.style.scrollBehavior = 'auto';

        const adjust = () => {
            const newScrollHeight = element.scrollHeight;
            const heightDiff = newScrollHeight - this.previousScrollHeight;
            const targetScrollTop = heightDiff + this.previousScrollTop;

            element.scrollTop = targetScrollTop;

            // Force layout/repaint
            void element.offsetHeight;

            this.logger.debug('SharedChatComponent', '⚓ [SharedChat] Scroll adjustment:', {
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
            const element = this.scrollContainer().nativeElement;
            element.scrollTop = element.scrollHeight;
        } catch {
            // The container is not in the DOM yet — the view has not rendered, or the
            // component is being torn down. Scrolling is cosmetic; nothing to recover.
        }
    }

    sendMessage(): void {
        const text = this.newMessage().trim();
        if (!text) {
            return;
        }

        this.send.emit(text);
        this.newMessage.set('');
        this.shouldScrollToBottom = true;
    }

    /** An optimistic message has no server id yet, so its position stands in for one. */
    trackByMessage(index: number, message: ChatMessage): string | number {
        return message.id ?? index;
    }
}
