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
    content: string;
    type: MessageType;
    timestamp: string; // LocalDateTime from backend -> ISO string in frontend
    reactions: { [key: string]: number };
}

export interface Conversation {
    id: string;
    participantIds: string[];
    type: ConversationType;
    updatedAt: string; // ISO DateTime
    lastMessage?: Message;
    isFull: boolean;
    messages: Message[];
}
