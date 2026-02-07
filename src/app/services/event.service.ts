import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface FeedEvent {
  id: number;
  title: string;
  organizer: string;
  date: Date;
  location: string;
  image: string;
  description: string;
  subscribed: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class Event {
  private events: FeedEvent[] = [
    {
      id: 1,
      title: 'Tech Conference 2026',
      organizer: 'TechWorld',
      date: new Date(2026, 1, 8), // Feb 8, 2026
      location: 'San Francisco, CA',
      image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80',
      description: 'Join us for the biggest tech conference of the year featuring top speakers from around the globe.',
      subscribed: false
    },
    {
      id: 2,
      title: 'Art Exhibition Opening',
      organizer: 'Modern Art Gallery',
      date: new Date(2026, 1, 10), // Feb 10, 2026
      location: 'New York, NY',
      image: 'https://images.unsplash.com/photo-1536924940846-227afb31e2a5?auto=format&fit=crop&w=800&q=80',
      description: 'Experience the latest works from emerging artists in our new collection.',
      subscribed: false
    },
    {
      id: 3,
      title: 'Music Festival',
      organizer: 'SoundWave',
      date: new Date(2026, 1, 12), // Feb 12, 2026
      location: 'Austin, TX',
      image: 'https://images.unsplash.com/photo-1459749411177-8c275341e5dd?auto=format&fit=crop&w=800&q=80',
      description: 'Three days of music, food, and fun under the stars.',
      subscribed: false
    },
    {
      id: 4,
      title: 'Startup Pitch Night',
      organizer: 'VentureHub',
      date: new Date(2026, 1, 14), // Feb 14, 2026
      location: 'London, UK',
      image: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=800&q=80',
      description: 'Watch 10 startups pitch their ideas to a panel of investors.',
      subscribed: false
    },
    {
      id: 5,
      title: 'Food & Wine Tasting',
      organizer: 'Culinary Masters',
      date: new Date(2026, 1, 15), // Feb 15, 2026
      location: 'Paris, France',
      image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&q=80',
      description: 'Sample exquisite wines and gourmet dishes from renowned chefs.',
      subscribed: false
    },
    {
      id: 6,
      title: 'Blockchain Summit',
      organizer: 'CryptoWorld',
      date: new Date(2026, 1, 18), // Feb 18, 2026
      location: 'Singapore',
      image: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&w=800&q=80',
      description: 'Explore the future of blockchain technology and cryptocurrency.',
      subscribed: false
    },
    {
      id: 7,
      title: 'Marathon Run',
      organizer: 'City Sports',
      date: new Date(2026, 1, 20), // Feb 20, 2026
      location: 'Boston, MA',
      image: 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?auto=format&fit=crop&w=800&q=80',
      description: 'Join thousands of runners in this annual city marathon event.',
      subscribed: false
    },
    {
      id: 8,
      title: 'Photography Workshop',
      organizer: 'Lens Masters',
      date: new Date(2026, 1, 22), // Feb 22, 2026
      location: 'Los Angeles, CA',
      image: 'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?auto=format&fit=crop&w=800&q=80',
      description: 'Learn advanced photography techniques from professional photographers.',
      subscribed: false
    }
  ];

  private eventsSubject = new BehaviorSubject<FeedEvent[]>(this.events);
  events$ = this.eventsSubject.asObservable();

  toggleSubscription(event: FeedEvent) {
    event.subscribed = !event.subscribed;
    this.eventsSubject.next([...this.events]);
  }
}
