import { Component, EventEmitter, Input, Output } from '@angular/core';
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
}

@Component({
    selector: 'app-shared-chat',
    standalone: true,
    imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule],
    templateUrl: './shared-chat.html',
    styleUrl: './shared-chat.scss'
})
export class SharedChatComponent {
    @Input() messages: ChatMessage[] = [];
    @Input() placeholder: string = 'Type a message...';
    @Input() loading: boolean = false;
    @Output() onSend = new EventEmitter<string>();

    newMessage: string = '';

    sendMessage() {
        if (this.newMessage.trim()) {
            this.onSend.emit(this.newMessage);
            this.newMessage = '';
        }
    }

    trackByMessage(index: number, message: ChatMessage): any {
        return message.id || index;
    }
}
