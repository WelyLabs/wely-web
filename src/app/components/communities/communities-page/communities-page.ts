import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Subject, debounceTime, distinctUntilChanged, finalize, switchMap } from 'rxjs';

import { Community } from '../../../models/community.model';
import { CommunityService } from '../../../services/community.service';
import { CommunityCardComponent } from '../community-card/community-card';
import { CommunityFormDialogComponent } from '../community-form-dialog/community-form-dialog';

type Tab = 'mine' | 'discover';

/** The communities tab: the ones I belong to, and the public ones to discover and join. */
@Component({
  selector: 'app-communities-page',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatIconModule, CommunityCardComponent],
  templateUrl: './communities-page.html',
  styleUrl: './communities-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunitiesPageComponent {
  private readonly communities = inject(CommunityService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly tab = signal<Tab>('mine');
  readonly mine = signal<Community[]>([]);
  readonly discovered = signal<Community[]>([]);
  readonly query = signal('');
  readonly interest = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);

  /** The interests the public communities on screen talk about, most frequent first: the filter chips. */
  readonly interests = computed(() => {
    const counts = new Map<string, number>();
    for (const community of this.discovered()) {
      for (const interest of community.interests) {
        counts.set(interest, (counts.get(interest) ?? 0) + 1);
      }
    }
    const selected = this.interest();
    const list = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
    return selected && !list.includes(selected) ? [selected, ...list] : list.slice(0, 12);
  });

  private readonly search$ = new Subject<{ query: string; interest: string | null }>();

  constructor() {
    this.loadMine();
    this.search$
      .pipe(
        debounceTime(250),
        distinctUntilChanged((a, b) => a.query === b.query && a.interest === b.interest),
        switchMap(({ query, interest }) => {
          this.loading.set(true);
          return this.communities.discover(query, interest ?? undefined).pipe(finalize(() => this.loading.set(false)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (list) => {
          this.error.set(false);
          this.discovered.set(list);
        },
        error: () => this.error.set(true),
      });
  }

  select(tab: Tab): void {
    this.tab.set(tab);
    if (tab === 'discover') {
      this.search();
    } else {
      this.loadMine();
    }
  }

  onQuery(value: string): void {
    this.query.set(value);
    this.search();
  }

  toggleInterest(interest: string): void {
    this.interest.set(this.interest() === interest ? null : interest);
    this.search();
  }

  create(): void {
    this.dialog
      .open(CommunityFormDialogComponent, { width: '520px', maxWidth: '95vw', autoFocus: 'first-tabbable' })
      .afterClosed()
      .subscribe((created?: Community) => {
        if (created) {
          void this.router.navigate(['/communities', created.communityId]);
        }
      });
  }

  loadMine(): void {
    this.loading.set(true);
    this.communities
      .mine()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (list) => {
          this.error.set(false);
          this.mine.set(list);
        },
        error: () => this.error.set(true),
      });
  }

  retry(): void {
    this.select(this.tab());
  }

  private search(): void {
    this.search$.next({ query: this.query(), interest: this.interest() });
  }
}
