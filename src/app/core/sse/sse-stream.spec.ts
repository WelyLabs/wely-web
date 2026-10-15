import { Subscription } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { statusResponse, streamResponse } from '../../../testing/sse-response';
import { SseMessage, SseParser, SseStreamError, sseStream } from './sse-stream';

describe('SseParser', () => {
    it('push_shouldJoinLinesSplitAcrossChunks', () => {
        const parser = new SseParser();
        expect(parser.push('event: po')).toEqual([]);
        expect(parser.push('ll\ndata: {"a"')).toEqual([]);
        expect(parser.push(':1}\n\n')).toEqual([{ event: 'poll', data: '{"a":1}' }]);
    });

    it('push_shouldJoinMultiLineDataWithNewlines', () => {
        const parser = new SseParser();
        expect(parser.push('data: one\r\ndata:two\r\n\r\n')).toEqual([{ event: 'message', data: 'one\ntwo' }]);
    });

    it('push_shouldIgnoreComments_andBlankLinesWithoutData', () => {
        const parser = new SseParser();
        expect(parser.push(': keep-alive\n\n\nretry: 10\n\n')).toEqual([]);
    });

    it('push_shouldAcceptAFieldWithoutAColon', () => {
        const parser = new SseParser();
        expect(parser.push('data\n\n')).toEqual([{ event: 'message', data: '' }]);
    });
});

describe('sseStream', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let subscription: Subscription | undefined;
    const token = vi.fn(() => Promise.resolve('t1'));

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        token.mockClear();
    });

    afterEach(() => {
        subscription?.unsubscribe();
        subscription = undefined;
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    const flush = () => new Promise(resolve => setTimeout(resolve, 0));

    it('sseStream_shouldSendTheBearerToken_andEmitEachEvent', async () => {
        fetchMock.mockResolvedValueOnce(streamResponse(['event: a\ndata: 1\n\n', ': ping\n\n', 'data: 2\n\n'], true));
        const messages: SseMessage[] = [];
        const onOpen = vi.fn();

        subscription = sseStream({ url: '/s', token, onOpen }).subscribe(message => messages.push(message));
        await flush();

        expect(fetchMock.mock.calls[0][0]).toBe('/s');
        expect((fetchMock.mock.calls[0][1] as RequestInit).headers)
            .toEqual({ Authorization: 'Bearer t1', Accept: 'text/event-stream' });
        expect(messages).toEqual([{ event: 'a', data: '1' }, { event: 'message', data: '2' }]);
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('sseStream_shouldError_onAFinalStatus', async () => {
        fetchMock.mockResolvedValueOnce(statusResponse(403));
        let failure: unknown;

        subscription = sseStream({ url: '/s', token, finalStatuses: [403] }).subscribe({ error: error => (failure = error) });
        await flush();

        expect((failure as SseStreamError).status).toBe(403);
    });

    it('sseStream_shouldReconnectWithBackoff_andCallOnOpenAgain', async () => {
        vi.useFakeTimers();
        const onOpen = vi.fn();
        const onRetry = vi.fn();
        fetchMock
            .mockResolvedValueOnce(streamResponse(['data: 1\n\n']))
            .mockResolvedValueOnce(statusResponse(502))
            .mockResolvedValueOnce(streamResponse([], true));

        subscription = sseStream({ url: '/s', token, onOpen, onRetry }).subscribe();
        await vi.advanceTimersByTimeAsync(0);
        expect(onRetry).toHaveBeenCalledWith(1_000, 'stream ended');

        await vi.advanceTimersByTimeAsync(1_000);
        expect(onRetry).toHaveBeenLastCalledWith(2_000, 'HTTP 502');
        await vi.advanceTimersByTimeAsync(2_000);

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(onOpen).toHaveBeenCalledTimes(2);
    });

    it('sseStream_shouldStopReading_whenTheSubscriberLeavesFromNext', async () => {
        fetchMock.mockResolvedValueOnce(streamResponse(['data: 1\n\ndata: 2\n\n'], true));
        const messages: SseMessage[] = [];

        subscription = sseStream({ url: '/s', token }).subscribe(message => {
            messages.push(message);
            subscription?.unsubscribe();
        });
        await flush();

        expect(messages).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
