/**
 * Notification dispatch. The domain decides channels + content
 * (buildNotifications); this layer sends them. The mock sender logs; swap in a
 * real transport (POST /notifications → Mailgun/Twilio/Expo push) when live.
 */
import { buildNotifications, type NotificationEvent, type NotificationRecipient, type NotificationMessage } from '../domain';

export interface NotifySender {
    send(messages: NotificationMessage[]): Promise<void>;
}

/** Dev sender — logs each message. */
export const consoleSender: NotifySender = {
    async send(messages) {
        for (const m of messages) console.log(`[notify:${m.channel}] ${m.subject ?? ''} ${m.body}`.trim());
    },
};

/** Collects messages in memory — handy for tests / previews. */
export function memorySender(): NotifySender & { sent: NotificationMessage[] } {
    const sent: NotificationMessage[] = [];
    return { sent, async send(messages) { sent.push(...messages); } };
}

/** Build the messages for an event and dispatch them. Returns what was sent. */
export async function notify(
    event: NotificationEvent,
    recipient: NotificationRecipient,
    sender: NotifySender = consoleSender,
): Promise<NotificationMessage[]> {
    const messages = buildNotifications(event, recipient);
    await sender.send(messages);
    return messages;
}
