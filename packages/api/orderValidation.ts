/**
 * Boundary input validation for order creation. Every external body is hostile:
 * validated + normalized here before it reaches the service. Rejects missing /
 * wrong-typed / oversized fields with a canonical ValidationError (400). Unknown
 * fields are dropped (not reflected back), so the service only ever sees a clean,
 * typed SubmitOrderInput.
 */
import { ValidationError } from './errors';
import type { SubmitOrderInput } from './orderContract';

const MAX_STR = 200; // ids, city, names, phone/email
const MAX_LINE = 300; // address line / note
const isStr = (v: unknown): v is string => typeof v === 'string';
const bounded = (v: string, max: number) => v.length > 0 && v.length <= max;

export function validateSubmitOrderInput(body: unknown): SubmitOrderInput {
    if (!body || typeof body !== 'object') throw new ValidationError('body must be an object');
    const b = body as Record<string, unknown>;

    if (!b.contact || typeof b.contact !== 'object') throw new ValidationError('contact is required');
    const c = b.contact as Record<string, unknown>;
    const phone = isStr(c.phone) ? c.phone : undefined;
    const email = isStr(c.email) ? c.email : undefined;
    if (!phone && !email) throw new ValidationError('contact needs a phone or email');
    if (phone && !bounded(phone, MAX_STR)) throw new ValidationError('contact.phone too long');
    if (email && !bounded(email, MAX_STR)) throw new ValidationError('contact.email too long');

    if (!isStr(b.cityId) || !bounded(b.cityId, MAX_STR)) throw new ValidationError('cityId is required');
    if (!isStr(b.serviceId) || !bounded(b.serviceId, MAX_STR)) throw new ValidationError('serviceId is required');

    let estValue: number | undefined;
    if (b.estValue !== undefined) {
        if (typeof b.estValue !== 'number' || !Number.isFinite(b.estValue) || b.estValue < 0 || b.estValue > 1_000_000) {
            throw new ValidationError('estValue must be a finite number in [0, 1e6]');
        }
        estValue = b.estValue;
    }

    const paymentMethod = b.paymentMethod;
    if (paymentMethod !== undefined && paymentMethod !== 'card' && paymentMethod !== 'pay_later' && paymentMethod !== 'cash') {
        throw new ValidationError('invalid paymentMethod');
    }

    let delivery: SubmitOrderInput['delivery'];
    if (b.delivery !== undefined) {
        if (typeof b.delivery !== 'object' || b.delivery === null) throw new ValidationError('delivery must be an object');
        const d = b.delivery as Record<string, unknown>;
        if (!isStr(d.recipientName) || !bounded(d.recipientName, MAX_STR)) throw new ValidationError('delivery.recipientName required');
        if (!isStr(d.line1) || !bounded(d.line1, MAX_LINE)) throw new ValidationError('delivery.line1 required');
        if (!isStr(d.city) || !bounded(d.city, MAX_STR)) throw new ValidationError('delivery.city required');
        if (!isStr(d.date)) throw new ValidationError('delivery.date required');
        if (!isStr(d.slot)) throw new ValidationError('delivery.slot required');
        if (d.note !== undefined && (!isStr(d.note) || d.note.length > MAX_LINE)) throw new ValidationError('delivery.note too long');
        if (d.recipientPhone !== undefined && (!isStr(d.recipientPhone) || !bounded(d.recipientPhone, MAX_STR))) throw new ValidationError('delivery.recipientPhone invalid');
        delivery = d as unknown as SubmitOrderInput['delivery'];
    }

    return {
        contact: { phone, email },
        cityId: b.cityId,
        serviceId: b.serviceId,
        firstName: isStr(b.firstName) && bounded(b.firstName, MAX_STR) ? b.firstName : undefined,
        estValue,
        paymentMethod: paymentMethod as SubmitOrderInput['paymentMethod'],
        delivery,
    };
}
