export enum ConversationType {
    PRIVATE = 'PRIVATE',
    GROUP = 'GROUP'
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
    timestamp: string; // LocalDateTime from backend -> ISO string in frontend
    reactions: Record<string, number>;
}

export interface Conversation {
    id: string;
    participantIds: string[];
    type: ConversationType;
    title?: string; // Optional title for UI
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
}
