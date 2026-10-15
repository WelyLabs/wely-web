import { computed, signal } from '@angular/core';
import { of } from 'rxjs';
import { vi } from 'vitest';

/** A DeletedUsersService that already knows which ids are deleted accounts; `deletedIds` can change mid-test. */
export function deletedUsersStub(deleted: readonly string[] = []) {
  const deletedIds = signal<ReadonlySet<string>>(new Set(deleted));
  return {
    deletedIds,
    isDeleted: vi.fn((userId: string | null | undefined) => computed(() => !!userId && deletedIds().has(userId))),
    check: vi.fn((userId: string) => of(deletedIds().has(userId))),
    deletedAmong: vi.fn((userIds: readonly string[]) => of<ReadonlySet<string>>(new Set(userIds.filter(id => deletedIds().has(id)))))
  };
}
