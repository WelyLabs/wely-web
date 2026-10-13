/** As wely-chat names them: a conversation stored before types existed comes back DIRECT. */
export enum ConversationType {
    DIRECT = 'DIRECT',
    GROUP = 'GROUP',
    /** An event's group, whose members follow who takes part. */
    EVENT = 'EVENT'
}

export enum MessageType {
    TEXT = 'TEXT',
    IMAGE = 'IMAGE',
    VIDEO = 'VIDEO',
    SYSTEM = 'SYSTEM'
}

export interface Message {
    id: string;
    senderId: string;
    senderName: string;
    receiverId: string;
    conversationId: string;
    content: string;
    type: MessageType;
    /** ISO instant with its zone, as wely-chat sends it. */
    timestamp: string;
    reactions: Record<string, number>;
    /** A photo the message carries; its URL is signed by wely-chat and works for an hour. */
    photo?: MessagePhoto | null;
}

/** A photo in a conversation. A removed one keeps its place in the thread, without a URL. */
export interface MessagePhoto {
    width: number;
    height: number;
    url?: string | null;
    removed: boolean;
}

/** One entry of a conversation's media tab. */
export interface ConversationPhoto {
    conversationId: string;
    messageId: string;
    senderId: string;
    photo: MessagePhoto;
    /** ISO instant; the cursor for the next page. */
    sentAt: string;
}

export interface Conversation {
    id: string;
    participantIds: string[];
    type: ConversationType;
    /** The event's title for an event group. */
    title?: string | null;
    /** The event an EVENT conversation belongs to. */
    eventId?: string | null;
    /** An event group's organizer, who may remove its photos. Older groups do not name one. */
    organizerId?: string | null;
    updatedAt: string; // ISO DateTime
    lastMessage?: Message;
    messages: Message[];
    bucketIndex: number;
}

/** Whether a user is connected to the chat right now, and when they were last seen. */
export interface Presence {
    userId: string;
    online: boolean;
    /** ISO instant; null for someone who never opened the chat. */
    lastSeenAt: string | null;
}

export interface MessageBucket {
    conversationId: string;
    bucketIndex: number;
    messages: Message[];
}

export interface ConversationSummary {
    id: string;
    /** Who takes part; a private conversation is named after the other one. */
    participantIds?: string[];
    type: ConversationType;
    title: string;
    updatedAt: string;
    lastMessage?: Message;
    lastBucketIndex: number;
    /** The event an EVENT conversation belongs to. */
    eventId?: string | null;
}
