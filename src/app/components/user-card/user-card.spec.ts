import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserCardComponent } from './user-card';
import { UserWithStatusDTO } from '../../models/user.model';
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
});
