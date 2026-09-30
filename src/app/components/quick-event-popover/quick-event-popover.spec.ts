import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QuickEventPopoverComponent } from './quick-event-popover';
import { EventCreateRequest } from '../../services/event.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('QuickEventPopoverComponent', () => {
    let component: QuickEventPopoverComponent;
    let fixture: ComponentFixture<QuickEventPopoverComponent>;

    const startDate = new Date('2025-06-01T10:00:00Z');
    const endDate = new Date('2025-06-01T11:00:00Z');

    const request = (): EventCreateRequest => ({
        title: '',
        location: '',
        startDate,
        endDate,
        description: '',
        subscribeByDefault: true
    });

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [QuickEventPopoverComponent, NoopAnimationsModule]
        }).compileComponents();

        fixture = TestBed.createComponent(QuickEventPopoverComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('data', request());
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should start from a copy of the incoming request', () => {
        expect(component.draft()).toEqual(request());
    });

    it('should not write through to the object it was handed', () => {
        // The reason this component owns a draft at all: [(ngModel)]="data.title" used to mutate
        // the parent's own popoverData as the user typed, so a dismissed popover left its edits
        // behind on the next open.
        const incoming = request();
        fixture.componentRef.setInput('data', incoming);

        component.update('title', 'Standup');

        expect(incoming.title).toBe('');
        expect(component.draft().title).toBe('Standup');
    });

    it('should reset the draft when a new slot is opened', () => {
        component.update('title', 'Abandoned');

        fixture.componentRef.setInput('data', { ...request(), title: 'Prefilled' });

        expect(component.draft().title).toBe('Prefilled');
    });

    it('should update each editable field', () => {
        component.update('location', 'Room 2');
        component.update('description', 'Weekly sync');
        component.update('subscribeByDefault', false);

        expect(component.draft().location).toBe('Room 2');
        expect(component.draft().description).toBe('Weekly sync');
        expect(component.draft().subscribeByDefault).toBe(false);
    });

    it('should emit the draft on save', () => {
        const emitted: EventCreateRequest[] = [];
        component.save.subscribe(value => emitted.push(value));
        component.update('title', 'Standup');

        component.onSave();

        expect(emitted).toHaveLength(1);
        expect(emitted[0].title).toBe('Standup');
        expect(emitted[0].startDate).toBe(startDate);
    });

    it('should refuse to save an event with no title', () => {
        const emit = vi.fn();
        component.save.subscribe(emit);

        component.onSave();

        expect(emit).not.toHaveBeenCalled();
    });

    it('should emit dismissed on cancel', () => {
        const emit = vi.fn();
        component.dismissed.subscribe(emit);

        component.onCancel();

        expect(emit).toHaveBeenCalled();
    });

    it('should default the position to a top arrow at the centre', () => {
        expect(component.position()).toEqual({ x: 0, y: 0, arrowSide: 'top' });
        expect(component.arrowOffset()).toBe(50);
        expect(component.isMobile()).toBe(false);
    });
});
