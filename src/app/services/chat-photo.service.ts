import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ConversationPhoto, Message } from '../models/chat.model';

/** Photos in conversations: wely-chat stores them privately and answers with signed URLs. */
@Injectable({ providedIn: 'root' })
export class ChatPhotoService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/chat-service/conversations`;

  /** Sends a photo, already scaled down, as a message; answers with the message as stored. */
  send(conversationId: string, photo: Blob, caption = ''): Observable<Message> {
    const form = new FormData();
    form.append('file', photo, 'photo.jpg');
    if (caption.trim()) {
      form.append('caption', caption.trim());
    }
    return this.http.post<Message>(`${this.apiUrl}/${conversationId}/photos`, form);
  }

  /** The media tab, newest first; `before` is the `sentAt` of the last photo already shown. */
  page(conversationId: string, before?: string): Observable<ConversationPhoto[]> {
    const params = before ? new HttpParams().set('before', before) : undefined;
    return this.http.get<ConversationPhoto[]>(`${this.apiUrl}/${conversationId}/photos`, { params });
  }

  /** By its sender, or in an event's group by its organizer. */
  remove(conversationId: string, messageId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${conversationId}/photos/${messageId}`);
  }
}
