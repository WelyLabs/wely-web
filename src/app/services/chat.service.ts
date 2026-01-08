import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { RSocketClient, JsonSerializer, IdentitySerializer } from 'rsocket-core';
import RSocketWebSocketClient from 'rsocket-websocket-client';
import { environment } from '../../environments/environment';
import { Conversation, Message } from '../models/chat.model';
import { UserService } from './user.service';

@Injectable({
    providedIn: 'root'
})
export class ChatService implements OnDestroy {
    private apiUrl = `${environment.apiUrl}/chat-service`;
    private client: any | undefined;
    private connectionPromise: Promise<any>;

    constructor(
        private http: HttpClient,
        private userService: UserService
    ) {
        this.connectionPromise = this.connect();
    }

    private connect(): Promise<any> {
        return new Promise((resolve, reject) => {
            this.client = new RSocketClient({
                serializers: {
                    data: JsonSerializer,
                    metadata: IdentitySerializer
                },
                setup: {
                    keepAlive: 60000,
                    lifetime: 180000,
                    dataMimeType: 'application/json',
                    metadataMimeType: 'message/x.rsocket.routing.v0',
                },
                transport: new RSocketWebSocketClient({
                    url: environment.rsocketUrl
                }),
            });

            this.client.connect().subscribe({
                onComplete: (socket: any) => {
                    console.log('✅ RSocket connected');
                    resolve(socket);
                },
                onError: (error: any) => {
                    console.error('❌ RSocket connection error:', error);
                    reject(error);
                },
                onSubscribe: (cancel: any) => { /* no-op */ }
            });
        });
    }

    /**
     * Get or create a conversation with a specific friend (HTTP)
     */
    getConversation(friendId: string): Observable<Conversation> {
        let params = new HttpParams().set('friendId', friendId);
        return this.http.get<Conversation>(`${this.apiUrl}/conversations`, { params });
    }

    /**
     * Send a message via RSocket
     */
    sendMessage(conversationId: string, content: string): Observable<Message> {
        return from(this.connectionPromise).pipe(
            switchMap(socket => {
                return new Observable<Message>(observer => {
                    const currentUser = this.userService.getCurrentUserValue();
                    if (!currentUser) {
                        observer.error('User not authenticated');
                        return;
                    }

                    const payload = {
                        data: {
                            content: content,
                            senderId: currentUser.id
                        },
                        metadata: String.fromCharCode(`chat.send.${conversationId}`.length) + `chat.send.${conversationId}`
                    };

                    socket.requestResponse(payload).subscribe({
                        onComplete: (payload: any) => {
                            const message = payload.data as Message;
                            observer.next(message);
                            observer.complete();
                        },
                        onError: (error: any) => {
                            console.error('RSocket sendMessage error:', error);
                            observer.error(error);
                        }
                    });
                });
            }),
            catchError(error => {
                console.error('Failed to send message (RSocket not connected?):', error);
                return throwError(() => new Error('Impossible d\'envoyer le message. Vérifiez votre connexion.'));
            })
        );
    }

    ngOnDestroy() {
        if (this.client) {
            this.client.close();
        }
    }
}
