import { describe, expect, it } from 'vitest';
import { MessageType, isSystemMessage } from './chat.model';

describe('chat.model', () => {
    it('isSystemMessage_shouldBeTrue_forASystemNotice', () => {
        expect(isSystemMessage({ type: MessageType.SYSTEM })).toBe(true);
    });

    it('isSystemMessage_shouldBeFalse_forTextOrAMissingType', () => {
        expect(isSystemMessage({ type: MessageType.TEXT })).toBe(false);
        expect(isSystemMessage({})).toBe(false);
    });
});
