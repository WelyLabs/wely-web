import { Injectable } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Location } from '@angular/common';

@Injectable({
    providedIn: 'root'
})
export class NavigationService {
    private history: string[] = [];

    constructor(private router: Router, private location: Location) {
        this.router.events
            .pipe(filter(event => event instanceof NavigationEnd))
            .subscribe((event: any) => {
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
