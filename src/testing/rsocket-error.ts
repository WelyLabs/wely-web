/**
 * The error rsocket-js rejects with when the server answers with an APPLICATION_ERROR frame:
 * the frame's data wrapped in the message, and verbatim in `source.message`.
 */
export function rsocketApplicationError(data: string): Error {
  return Object.assign(
    new Error(`RSocket error 0x201 (APPLICATION_ERROR): ${data}. See error \`source\` property for details.`),
    { source: { code: 0x201, explanation: 'APPLICATION_ERROR', message: data } },
  );
}

/** wely-chat's JSON problem for an RSocket refusal, as the error frame's data. */
export function rsocketProblemJson(code: string, status: number, detail: string, requestId = 'req-42'): string {
  return JSON.stringify({
    type: 'about:blank', title: 'Forbidden', status, detail, code,
    timestamp: '2026-10-20T10:00:00Z', requestId,
  });
}
