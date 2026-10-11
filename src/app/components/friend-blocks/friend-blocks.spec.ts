import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { FriendBlocksComponent } from './friend-blocks';

describe('FriendBlocksComponent', () => {
    let fixture: ComponentFixture<FriendBlocksComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({ imports: [FriendBlocksComponent] }).compileComponents();
        fixture = TestBed.createComponent(FriendBlocksComponent);
    });

    const render = (blocks: FriendBlocksComponent['blocks'] extends () => infer T ? T : never) => {
        fixture.componentRef.setInput('blocks', blocks);
        fixture.detectChanges();
        return Array.from(fixture.nativeElement.querySelectorAll('.friend-block')) as HTMLElement[];
    };

    it('blocks_shouldBePlacedWhereTheyBelong', () => {
        const [block] = render([{ top: 120, height: 40, title: 'Poterie', location: null }]);

        expect(block.style.top).toBe('120px');
        expect(block.style.height).toBe('40px');
        expect(block.textContent?.trim()).toBe('Poterie');
        expect(block.classList).not.toContain('busy');
    });

    it('blocks_shouldReadBusy_whenNothingIsDisclosed', () => {
        const [block] = render([{ top: 0, height: 40, title: null, location: null }]);

        expect(block.textContent?.trim()).toBe('Occupé');
        expect(block.classList).toContain('busy');
    });

    it('blocks_shouldShowTheLocation_whenDisclosed', () => {
        const [block] = render([{ top: 0, height: 40, title: 'Théâtre', location: 'Célestins' }]);

        expect(block.querySelector('.friend-block-location')?.textContent).toBe('Célestins');
    });
});
