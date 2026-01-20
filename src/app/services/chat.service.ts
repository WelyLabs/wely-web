import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, from, throwError, Subject } from 'rxjs';
import { switchMap, catchError, timeout } from 'rxjs/operators';
import { RSocketClient, JsonSerializer, IdentitySerializer, encodeCompositeMetadata, encodeRoute, MESSAGE_RSOCKET_ROUTING, MESSAGE_RSOCKET_COMPOSITE_METADATA, BufferEncoders, encodeAndAddWellKnownAuthMetadata, MESSAGE_RSOCKET_AUTHENTICATION } from 'rsocket-core';
import RSocketWebSocketClient from 'rsocket-websocket-client';
import { environment } from '../../environments/environment';
import { Conversation, Message, MessageType } from '../models/chat.model';
import { UserService } from './user.service';
import { Buffer } from 'buffer';

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
                    data: {
                        serialize: (data: any) => Buffer.from(JSON.stringify(data)),
                        deserialize: (data: Buffer) => JSON.parse(data.toString())
                    },
                    metadata: IdentitySerializer
                },
                setup: {
                    keepAlive: 60000,
                    lifetime: 180000,
                    dataMimeType: 'application/json',
                    metadataMimeType: MESSAGE_RSOCKET_COMPOSITE_METADATA.string,
                },
                transport: new RSocketWebSocketClient({
                    url: environment.rsocketUrl
                }, BufferEncoders),
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

    private getMetadata(route: string): any {
        const token = this.userService.getAccessToken();

        const tokenBuffer = Buffer.concat([
            Buffer.from([0x81]),
            Buffer.from(token)
        ]);

        return encodeCompositeMetadata([
            [MESSAGE_RSOCKET_ROUTING, encodeRoute(route)],
            [MESSAGE_RSOCKET_AUTHENTICATION, tokenBuffer]
        ]);
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
                        metadata: this.getMetadata("chat.send")
                    };

                    // Use fireAndForget as backend likely returns void
                    socket.requestResponse(payload).subscribe({
                        onComplete: () => {
                            console.log("✅ Frame envoyée et acquittée par le serveur");
                        },
                        onError: (e: any) => console.error("❌ Erreur envoi:", e)
                    });

                    // Optimistic update
                    const message: Message = {
                        id: Date.now().toString(),
                        senderId: currentUser.id,
                        content: content,
                        type: MessageType.TEXT,
                        timestamp: new Date().toISOString(),
                        reactions: {}
                    };

                    observer.next(message);
                    observer.complete();

                });
            }),
            catchError(error => {
                console.error('Failed to send message:', error);
                return throwError(() => new Error('Impossible d\'envoyer le message. Vérifiez votre connexion.'));
            })
        );
    }

    private messagesSubject = new Subject<any>();
    public messages$ = this.messagesSubject.asObservable();

    initializeStream() {
        from(this.connectionPromise).pipe(
            switchMap(socket => {
                return new Observable<any>(observer => {
                    const route = 'chat.stream';
                    const payload = {
                        data: null,
                        metadata: this.getMetadata(route)
                    };

                    console.log('🔌 Initialisation du flux global RSocket (simple routing):', route);

                    socket.requestStream(payload).subscribe({
                        onNext: (payload: any) => {
                            const msg = payload.data;
                            console.log('📥 Message global reçu:', msg);
                            this.messagesSubject.next(msg);
                        },
                        onError: (error: any) => {
                            console.error('❌ Erreur flux global:', error);
                        },
                        onComplete: () => {
                            console.log('Flux global terminé');
                        },
                        onSubscribe: (subscription: any) => {
                            subscription.request(2147483647);
                        }
                    });
                });
            })
        ).subscribe();
    }

    ngOnDestroy() {
        if (this.client) {
            this.client.close();
        }
    }
}
