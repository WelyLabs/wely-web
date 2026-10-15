/** A fetch response whose body yields the given chunks, then ends (or stays open). jsdom has no ReadableStream. */
export function streamResponse(chunks: string[], keepOpen = false): Response {
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

/** A fetch response refused with the given status. */
export const statusResponse = (status: number) => ({ ok: false, status, body: null }) as Response;
