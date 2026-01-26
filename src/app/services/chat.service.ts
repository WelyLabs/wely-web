import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, from, throwError, Subject, BehaviorSubject, of, timer } from 'rxjs';
import { switchMap, catchError, retry, tap, delayWhen, takeUntil, filter } from 'rxjs/operators';
import { RSocketClient, JsonSerializer, IdentitySerializer, encodeCompositeMetadata, encodeRoute, MESSAGE_RSOCKET_ROUTING, MESSAGE_RSOCKET_COMPOSITE_METADATA, BufferEncoders, encodeAndAddWellKnownAuthMetadata, MESSAGE_RSOCKET_AUTHENTICATION } from 'rsocket-core';
import RSocketWebSocketClient from 'rsocket-websocket-client';
import { environment } from '../../environments/environment';
import { Conversation, Message, MessageType, MessageBucket, ConversationSummary } from '../models/chat.model';
import { UserService } from './user.service';
import { Buffer } from 'buffer';

@Injectable({
    providedIn: 'root'
})
export class ChatService implements OnDestroy {
    private apiUrl = `${environment.apiUrl}/chat-service`;
    private client: any | undefined;
    private socketSubject = new BehaviorSubject<any>(null);
    private destroy$ = new Subject<void>();
    private messagesSubject = new Subject<any>();
    public messages$ = this.messagesSubject.asObservable();

    constructor(
        private http: HttpClient,
        private userService: UserService
    ) {
        this.connect();
    }

    private connect(): void {
        console.log('🔌 Tentative de connexion RSocket...');

        this.client = new RSocketClient({
            serializers: {
                data: {
                    serialize: (data: any) => Buffer.from(JSON.stringify(data)),
                    deserialize: (data: Buffer) => JSON.parse(data.toString())
                },
                metadata: IdentitySerializer
            },
            setup: {
                keepAlive: 30000,
                lifetime: 90000,
                dataMimeType: 'application/json',
                metadataMimeType: MESSAGE_RSOCKET_COMPOSITE_METADATA.string,
            },
            transport: new RSocketWebSocketClient({
                url: environment.rsocketUrl
            }, BufferEncoders),
        });

        this.client.connect().subscribe({
            onComplete: (socket: any) => {
                console.log('✅ RSocket connecté');
                this.socketSubject.next(socket);

                // Listen for connection close
                socket.connectionStatus().subscribe((status: any) => {
                    console.log('📡 RSocket Status:', status);
                    if (status.kind === 'CLOSED' || status.kind === 'ERROR') {
                        this.handleDisconnect();
                    }
                });
            },
            onError: (error: any) => {
                console.error('❌ RSocket connection error:', error);
                this.handleDisconnect();
            },
            onSubscribe: (cancel: any) => { /* no-op */ }
        });
    }

    private isReconnecting = false;
    private handleDisconnect() {
        if (this.isReconnecting) return;
        this.isReconnecting = true;
        this.socketSubject.next(null);

        console.log('🔄 Reconnexion RSocket dans 5 secondes...');
        timer(5000).pipe(takeUntil(this.destroy$)).subscribe(() => {
            this.isReconnecting = false;
            this.connect();
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
     * Get all active conversations for the current user
     */
    getAllConversations(): Observable<ConversationSummary[]> {
        return this.http.get<ConversationSummary[]>(`${this.apiUrl}/conversations/all`);
    }

    /**
     * Get a conversation by its unique ID (HTTP)
     */
    getConversationById(conversationId: string): Observable<Conversation> {
        return this.http.get<Conversation>(`${this.apiUrl}/conversations/${conversationId}`);
    }

    /**
     * Get a bucket of messages for a conversation (HTTP)
     */
    getMessages(conversationId: string, bucketIndex: number): Observable<MessageBucket> {
        let params = new HttpParams().set('bucketIndex', bucketIndex.toString());
        return this.http.get<MessageBucket>(`${this.apiUrl}/conversations/${conversationId}/loadMessages`, { params });
    }

    /**
     * Send a message via RSocket
     */
    sendMessage(conversationId: string, content: string, receiverId: string): Observable<Message> {
        return this.socketSubject.pipe(
            filter(socket => !!socket),
            switchMap(socket => {
                return new Observable<Message>(observer => {
                    const currentUser = this.userService.getCurrentUserValue();

                    if (!currentUser) {
                        observer.error('User not authenticated');
                        return;
                    }

                    const payload = {
                        data: {
                            receiverId: receiverId,
                            conversationId: conversationId,
                            content: content
                        },
                        metadata: this.getMetadata("chat.send")
                    };

                    socket.requestResponse(payload).subscribe({
                        onComplete: () => {
                            console.log("✅ Frame envoyée et acquittée par le serveur");
                        },
                        onError: (e: any) => {
                            console.error("❌ Erreur envoi:", e);
                            observer.error(e);
                        }
                    });

                    // Optimistic update
                    const message: Message = {
                        id: Date.now().toString(),
                        senderId: currentUser.id,
                        senderName: currentUser.userName,
                        receiverId: receiverId,
                        conversationId: conversationId,
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

    private isStreamStarted = false;
    initializeStream() {
        if (this.isStreamStarted) return;
        this.isStreamStarted = true;

        this.socketSubject.pipe(
            filter(socket => !!socket),
            switchMap(socket => {
                return new Observable<any>(observer => {
                    const route = 'chat.stream';
                    const payload = {
                        data: null,
                        metadata: this.getMetadata(route)
                    };

                    console.log('🔌 Initialisation du flux global RSocket:', route);

                    const subscription = socket.requestStream(payload).subscribe({
                        onNext: (payload: any) => {
                            const msg = payload.data;
                            console.log('📥 Message global reçu:', msg);
                            this.messagesSubject.next(msg);
                        },
                        onError: (error: any) => {
                            console.error('❌ Erreur flux global:', error);
                            observer.error(error);
                        },
                        onComplete: () => {
                            console.log('Flux global terminé');
                            observer.complete();
                        },
                        onSubscribe: (sub: any) => {
                            sub.request(2147483647);
                        }
                    });

                    return () => subscription.cancel();
                });
            }),
            retry({
                delay: (error) => {
                    console.log('🔄 Tentative de reprise du flux dans 2s...');
                    return timer(2000);
                }
            }),
            takeUntil(this.destroy$)
        ).subscribe();
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
        if (this.client) {
            this.client.close();
        }
    }
}
