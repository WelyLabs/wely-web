import { Injectable, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Location } from '@angular/common';

@Injectable({
    providedIn: 'root'
})
export class NavigationService {
    private router = inject(Router);
    private location = inject(Location);

    private history: string[] = [];

    constructor() {
        this.router.events
            // Le prédicat de type porte l'information : plus besoin de caster ensuite.
            .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
            .subscribe((event) => {
                const url = event.urlAfterRedirects;
                if (this.history[this.history.length - 1] !== url) {
                    this.history.push(url);
                }
            });
    }

    back(): void {
        this.history.pop();
        if (this.history.length > 0) {
            this.location.back();
        } else {
            this.router.navigateByUrl('/conversations');
        }
    }
}
