import 'zone.js';
import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import {
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting
} from '@angular/platform-browser-dynamic/testing';
import { vi } from 'vitest';

// Global mocks
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

const MockResizeObserver = class {
    constructor(public callback: any) { }
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
};

// Apply mocks IMMEDIATELY and globally
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
vi.stubGlobal('ResizeObserver', MockResizeObserver);

(globalThis as any).IntersectionObserver = MockIntersectionObserver;
(globalThis as any).ResizeObserver = MockResizeObserver;
(window as any).IntersectionObserver = MockIntersectionObserver;
(window as any).ResizeObserver = MockResizeObserver;

// Initialize TestBed environment safely
try {
    getTestBed().initTestEnvironment(
        BrowserDynamicTestingModule,
        platformBrowserDynamicTesting()
    );
    console.log('🚀 [TestSetup] Test Environment initialized.');
} catch (e) {
    // Environment might already be initialized by another worker or test run
    // console.log('⚠️ [TestSetup] Test Environment already initialized.');
}
