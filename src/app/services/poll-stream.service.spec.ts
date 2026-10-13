import { TestBed } from '@angular/core/testing';
import { KeycloakService } from 'keycloak-angular';
import { Subscription } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../environments/environment';
import { LoggerService } from '../core/logging/logger.service';
import { Poll } from './event.service';
import { PollStreamError, PollStreamService, SseParser } from './poll-stream.service';

const pollJson = (status: 'OPEN' | 'CLOSED', yes: string[] = []) => JSON.stringify({
    status,
    fixedSlotId: status === 'CLOSED' ? 's1' : null,
    slots: [{ id: 's1', start: '2026-11-02T18:00:00Z', end: '2026-11-02T20:00:00Z', yes, maybe: [], no: [] }]
});

/** A response whose body yields the given chunks, then ends (or stays open). jsdom has no ReadableStream. */
function streamResponse(chunks: string[], keepOpen = false): Response {
    const encoder = new TextEncoder();
    const queue = chunks.map(chunk => encoder.encode(chunk));
    const reader = {
        read: () => queue.length > 0
            ? Promise.resolve({ done: false, value: queue.shift() })
            : keepOpen ? new Promise<never>(() => undefined) : Promise.resolve({ done: true, value: undefined }),
        cancel: () => Promise.resolve()
    };
    const body = { getReader: () => reader } as unknown as ReadableStream<Uint8Array>;
    return { ok: true, status: 200, body } as Response;
}

const statusResponse = (status: number) => ({ ok: false, status, body: null }) as Response;

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
});

describe('PollStreamService', () => {
    let service: PollStreamService;
    let fetchMock: ReturnType<typeof vi.fn>;
    const getToken = vi.fn(() => Promise.resolve('token-1'));
    const url = `${environment.apiUrl}/events-service/events/e1/poll/stream`;
    let subscription: Subscription | undefined;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        getToken.mockClear();
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                PollStreamService,
                { provide: KeycloakService, useValue: { getToken } },
                { provide: LoggerService, useValue: { warn: vi.fn(), error: vi.fn() } }
            ]
        });
        service = TestBed.inject(PollStreamService);
    });

    afterEach(() => {
        subscription?.unsubscribe();
        subscription = undefined;
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    /** Lets the fetch and reader promises settle. */
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));

    it('follow_shouldSendTheBearerToken_andEmitEachPoll', async () => {
        fetchMock.mockResolvedValueOnce(streamResponse([
            `event: poll\ndata: ${pollJson('OPEN')}\n\n`,
            ': keep-alive\n\n',
            `event: poll\ndata: ${pollJson('OPEN', ['u1'])}\n\n`
        ], true));
        const polls: Poll[] = [];

        subscription = service.follow('e1').subscribe(poll => polls.push(poll));
        await flush();

        const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(calledUrl).toBe(url);
        expect(init.headers).toEqual({ Authorization: 'Bearer token-1', Accept: 'text/event-stream' });
        expect(polls).toHaveLength(2);
        expect(polls[1].slots[0].yes).toEqual(['u1']);
        expect(polls[1].slots[0].start).toEqual(new Date('2026-11-02T18:00:00Z'));
    });

    it('follow_shouldComplete_whenAClosedPollArrives', async () => {
        fetchMock.mockResolvedValueOnce(streamResponse([`event: poll\ndata: ${pollJson('CLOSED')}\n\n`], true));
        let completed = false;
        const polls: Poll[] = [];

        subscription = service.follow('e1').subscribe({ next: poll => polls.push(poll), complete: () => (completed = true) });
        await flush();

        expect(polls.map(poll => poll.status)).toEqual(['CLOSED']);
        expect(completed).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('follow_shouldError_withoutReconnecting_whenTheEventIsNotVisible', async () => {
        fetchMock.mockResolvedValueOnce(statusResponse(404));
        let failure: unknown;

        subscription = service.follow('e1').subscribe({ error: error => (failure = error) });
        await flush();

        expect(failure).toBeInstanceOf(PollStreamError);
        expect((failure as PollStreamError).status).toBe(404);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('follow_shouldError_whenForbidden', async () => {
        fetchMock.mockResolvedValueOnce(statusResponse(403));
        let failure: unknown;

        subscription = service.follow('e1').subscribe({ error: error => (failure = error) });
        await flush();

        expect((failure as PollStreamError).status).toBe(403);
    });

    it('follow_shouldReconnectWithBackoff_andAFreshToken_whenTheStreamEnds', async () => {
        vi.useFakeTimers();
        getToken.mockResolvedValueOnce('token-1').mockResolvedValueOnce('token-2');
        fetchMock
            .mockResolvedValueOnce(streamResponse([`data: ${pollJson('OPEN')}\n\n`]))
            .mockRejectedValueOnce(new TypeError('network down'))
            .mockResolvedValueOnce(statusResponse(502))
            .mockResolvedValueOnce(streamResponse([`event: poll\ndata: ${pollJson('OPEN', ['u2'])}\n\n`], true));
        const polls: Poll[] = [];

        subscription = service.follow('e1').subscribe(poll => polls.push(poll));
        await vi.advanceTimersByTimeAsync(0);
        expect(polls).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(999);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const second = fetchMock.mock.calls[1][1] as RequestInit;
        expect(second.headers).toEqual({ Authorization: 'Bearer token-2', Accept: 'text/event-stream' });

        await vi.advanceTimersByTimeAsync(2_000);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        await vi.advanceTimersByTimeAsync(4_000);
        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(polls.at(-1)?.slots[0].yes).toEqual(['u2']);
    });

    it('follow_shouldCapTheBackoffAtThirtySeconds', async () => {
        vi.useFakeTimers();
        fetchMock.mockRejectedValue(new TypeError('network down'));

        subscription = service.follow('e1').subscribe();
        await vi.advanceTimersByTimeAsync(0);
        // 1 + 2 + 4 + 8 + 16 s, then 30 s instead of 32 s.
        await vi.advanceTimersByTimeAsync(31_000);
        expect(fetchMock).toHaveBeenCalledTimes(6);
        await vi.advanceTimersByTimeAsync(29_999);
        expect(fetchMock).toHaveBeenCalledTimes(6);
        await vi.advanceTimersByTimeAsync(1);
        expect(fetchMock).toHaveBeenCalledTimes(7);
    });

    it('follow_shouldAbortTheRequest_andStopRetrying_onUnsubscribe', async () => {
        vi.useFakeTimers();
        fetchMock.mockResolvedValueOnce(streamResponse([], true)).mockRejectedValue(new TypeError('down'));

        const sub = service.follow('e1').subscribe();
        await vi.advanceTimersByTimeAsync(0);
        const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;
        expect(signal.aborted).toBe(false);

        sub.unsubscribe();
        await vi.advanceTimersByTimeAsync(60_000);

        expect(signal.aborted).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
