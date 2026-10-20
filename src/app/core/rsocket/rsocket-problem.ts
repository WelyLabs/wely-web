/**
 * Reads the problem out of a failed RSocket request.
 *
 * <p>wely-chat answers a refused RSocket request with an APPLICATION_ERROR frame. Its data used to
 * be the problem's detail alone, as plain text; it is now the same JSON problem the REST routes send
 * as `application/problem+json`: `{"type","title","status","detail","code","timestamp","requestId"}`.
 * rsocket-js turns the frame into an `Error` whose `source.message` holds that data verbatim, and
 * whose own message wraps it in `RSocket error 0x201 (APPLICATION_ERROR): … See error …`.
 *
 * <p>Both shapes are read, so the front works against either backend.
 */
export interface RSocketProblem {
  /** The wely error code, e.g. `CHT-BUS-003`; absent when the server sent plain text. */
  code?: string;
  /** What went wrong, in the server's words; the raw text when it was not a problem. */
  detail: string;
  status?: number;
  /** The id the server logged the failure under, to find it in its logs. */
  requestId?: string;
}

/** rsocket-js's wrapper around an error frame's data, when only the message is at hand. */
const RSOCKET_ERROR_MESSAGE = /^RSocket error 0x[0-9a-f]+ \([A-Z_]+\): ([\s\S]*)\. See error `source` property for details\.$/;

const UNKNOWN_DETAIL = 'Unknown RSocket error';

/** Turns whatever a failed RSocket request rejected with into a problem; never throws. */
export function parseRSocketError(error: unknown): RSocketProblem {
  const text = frameText(error);
  return parseProblemJson(text) ?? { detail: text };
}

/** A one-line summary of a problem's identifiers for a log message; empty when it has none. */
export function describeRSocketProblem(problem: RSocketProblem): string {
  const parts = [
    problem.code && `code=${problem.code}`,
    problem.status !== undefined && `status=${problem.status}`,
    problem.requestId && `requestId=${problem.requestId}`,
  ].filter((part): part is string => typeof part === 'string');
  return parts.length ? ` [${parts.join(', ')}]` : '';
}

/** The error frame's data: from `source.message` when rsocket-js set it, else from the message. */
function frameText(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (!(error instanceof Error)) {
    return UNKNOWN_DETAIL;
  }
  const source: unknown = (error as Error & { source?: unknown }).source;
  if (isRecord(source) && typeof source['message'] === 'string') {
    return source['message'];
  }
  return RSOCKET_ERROR_MESSAGE.exec(error.message)?.[1] ?? error.message;
}

/** The problem in a JSON object string; null when the text is not one. */
function parseProblemJson(text: string): RSocketProblem | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const { code, detail, title, status, requestId } = parsed;
  return {
    ...(typeof code === 'string' && code ? { code } : {}),
    detail: typeof detail === 'string' && detail ? detail : typeof title === 'string' && title ? title : text,
    ...(typeof status === 'number' && Number.isFinite(status) ? { status } : {}),
    ...(typeof requestId === 'string' && requestId ? { requestId } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
