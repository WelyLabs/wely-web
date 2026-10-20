import { describe, expect, it } from 'vitest';
import { describeRSocketProblem, parseRSocketError } from './rsocket-problem';
import { rsocketApplicationError, rsocketProblemJson } from '../../../testing/rsocket-error';

describe('parseRSocketError', () => {
  it('parseRSocketError_shouldReadTheJsonProblem_ofAnApplicationErrorFrame', () => {
    const error = rsocketApplicationError(rsocketProblemJson('CHT-BUS-003', 403, 'Not a participant of this conversation'));

    expect(parseRSocketError(error)).toEqual({
      code: 'CHT-BUS-003', status: 403, detail: 'Not a participant of this conversation', requestId: 'req-42',
    });
  });

  it('parseRSocketError_shouldReadTheJsonProblem_whenOnlyTheWrappedMessageIsLeft', () => {
    const { message } = rsocketApplicationError(rsocketProblemJson('CHT-BUS-011', 403, 'This account has been deleted.'));

    expect(parseRSocketError(new Error(message))).toEqual({
      code: 'CHT-BUS-011', status: 403, detail: 'This account has been deleted.', requestId: 'req-42',
    });
  });

  it('parseRSocketError_shouldKeepPlainText_asTheDetail', () => {
    expect(parseRSocketError(rsocketApplicationError('This account has been deleted.')))
      .toEqual({ detail: 'This account has been deleted.' });
    expect(parseRSocketError(new Error('connection lost'))).toEqual({ detail: 'connection lost' });
    expect(parseRSocketError('refused')).toEqual({ detail: 'refused' });
  });

  it('parseRSocketError_shouldFallBackToTheText_whenTheJsonIsMalformed', () => {
    const data = '{"code":"CHT-BUS-003","detail":';

    expect(parseRSocketError(rsocketApplicationError(data))).toEqual({ detail: data });
  });

  it('parseRSocketError_shouldFallBackToTheText_whenTheJsonIsNotAnObject', () => {
    expect(parseRSocketError(rsocketApplicationError('"CHT-BUS-003"'))).toEqual({ detail: '"CHT-BUS-003"' });
    expect(parseRSocketError(rsocketApplicationError('42'))).toEqual({ detail: '42' });
    expect(parseRSocketError(rsocketApplicationError('null'))).toEqual({ detail: 'null' });
    expect(parseRSocketError(rsocketApplicationError('[{"code":"CHT-BUS-003"}]'))).toEqual({ detail: '[{"code":"CHT-BUS-003"}]' });
  });

  it('parseRSocketError_shouldIgnoreMistypedFields_andFallBackToTheTitle', () => {
    const data = JSON.stringify({ code: 3, status: '403', requestId: '', title: 'Forbidden' });

    expect(parseRSocketError(rsocketApplicationError(data))).toEqual({ detail: 'Forbidden' });
  });

  it('parseRSocketError_shouldKeepTheRawJson_asTheDetail_whenTheProblemHasNoText', () => {
    const data = JSON.stringify({ code: 'CHT-BUS-003' });

    expect(parseRSocketError(rsocketApplicationError(data))).toEqual({ code: 'CHT-BUS-003', detail: data });
  });

  it('parseRSocketError_shouldNotThrow_onAnythingElse', () => {
    expect(parseRSocketError(undefined)).toEqual({ detail: 'Unknown RSocket error' });
    expect(parseRSocketError({ message: 'not an Error' })).toEqual({ detail: 'Unknown RSocket error' });
  });
});

describe('describeRSocketProblem', () => {
  it('describeRSocketProblem_shouldListTheIdentifiersPresent', () => {
    expect(describeRSocketProblem({ code: 'CHT-BUS-003', status: 403, detail: 'x', requestId: 'req-42' }))
      .toBe(' [code=CHT-BUS-003, status=403, requestId=req-42]');
    expect(describeRSocketProblem({ code: 'CHT-BUS-003', detail: 'x' })).toBe(' [code=CHT-BUS-003]');
  });

  it('describeRSocketProblem_shouldBeEmpty_forPlainText', () => {
    expect(describeRSocketProblem({ detail: 'connection lost' })).toBe('');
  });
});
