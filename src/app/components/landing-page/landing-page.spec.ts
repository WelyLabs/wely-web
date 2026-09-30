import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LandingPageComponent } from './landing-page';
import { Router } from '@angular/router';
import { KeycloakService } from 'keycloak-angular';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('LandingPageComponent', () => {
    let component: LandingPageComponent;
    let fixture: ComponentFixture<LandingPageComponent>;
    let keycloakMock: any;
    let routerMock: any;

    beforeEach(async () => {
        keycloakMock = {
            isLoggedIn: vi.fn().mockResolvedValue(false),
            login: vi.fn().mockResolvedValue({}),
            register: vi.fn().mockResolvedValue({})
        };
        routerMock = {
            navigate: vi.fn()
        };

        await TestBed.configureTestingModule({
            imports: [LandingPageComponent, NoopAnimationsModule],
        }).overrideComponent(LandingPageComponent, {
            set: {
                providers: [
                    { provide: KeycloakService, useValue: keycloakMock },
                    { provide: Router, useValue: routerMock }
                ]
            }
        }).compileComponents();

        fixture = TestBed.createComponent(LandingPageComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should navigate to calendar if already logged in when launching app', async () => {
        keycloakMock.isLoggedIn.mockResolvedValue(true);
        await component.launchApp();
        expect(routerMock.navigate).toHaveBeenCalledWith(['/calendar']);
    });

    it('should call login if not logged in when launching app', async () => {
        keycloakMock.isLoggedIn.mockResolvedValue(false);
        await component.launchApp();
        expect(keycloakMock.login).toHaveBeenCalled();
    });

    it('should call register when signup is called', async () => {
        await component.signup();
        expect(keycloakMock.register).toHaveBeenCalled();
    });

    it('should toggle mobile menu', () => {
        expect(component.showMobileMenu()).toBe(false);
        component.toggleMenu();
        expect(component.showMobileMenu()).toBe(true);
        component.toggleMenu();
        expect(component.showMobileMenu()).toBe(false);
    });

    it('should close mobile menu', () => {
        component.showMobileMenu.set(true);
        component.closeMenu();
        expect(component.showMobileMenu()).toBe(false);
    });

    it('should close the menu on Escape when it is open', () => {
        component.showMobileMenu.set(true);
        component.onEscape();
        expect(component.showMobileMenu()).toBe(false);
    });

    it('should do nothing on Escape when the menu is already closed', () => {
        component.onEscape();
        expect(component.showMobileMenu()).toBe(false);
    });

    it('should expose the three feature cards the template renders', () => {
        expect(component.features).toHaveLength(3);
        expect(component.features.map(feature => feature.icon))
            .toEqual(['calendar_today', 'event_note', 'chat']);
    });
});
