import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { EventCreateRequest } from '../../services/event.service';

@Component({
    selector: 'app-quick-event-popover',
    standalone: true,
    imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule],
    templateUrl: './quick-event-popover.html',
    styleUrl: './quick-event-popover.scss'
})
export class QuickEventPopoverComponent {
    @Input() data: EventCreateRequest = {
        title: '',
        location: '',
        startDate: new Date(),
        endDate: new Date(),
        description: '',
        subscribeByDefault: true
    };
    @Input() position = { x: 0, y: 0, arrowSide: 'top' as 'top' | 'left' | 'right' };
    @Input() isMobile = false;

    @Output() save = new EventEmitter<EventCreateRequest>();
    @Output() cancel = new EventEmitter<void>();

    onSave() {
        if (this.data.title) {
            this.save.emit(this.data);
        }
    }

    onCancel() {
        this.cancel.emit();
    }
}
