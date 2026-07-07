import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View, Pressable, TextInput, Linking, PanResponder, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { demoAvailability, demoMissions } from '@heyhomie/api';
import {
    addOnsFor,
    estimateMissionMinutes,
    workersFor,
    formatDuration,
    tr,
    enabledCities,
    availableServices,
    sortedServiceIds,
    serviceById,
    serviceIcon,
    cityName,
    initialCity,
    frequenciesFor,
    isLeadService,
    serviceDetail,
    validateBilling,
    validateSignup,
    isValidPolishPhone,
    validateDelivery,
    DELIVERY_SLOTS,
    DELIVERY_NOTE_MAX,
    PAYMENT_METHODS,
    frequencyLabel,
    CONTACT_PHONE,
    CANCELLATION_WINDOW_HOURS,
    TRAVEL_BUFFER_MINUTES,
    type CleaningPlan,
    type AddOnId,
    type SelectedAddOn,
    type ServiceDef,
    type Frequency,
    type BillingDetails,
    type Contact,
    type DeliveryDetails,
    type DeliverySlotId,
    type PaymentMethod,
    type ServiceDetail,
    type Locale,
} from '@heyhomie/domain';
import { colors, spacing, typography, radii } from '@heyhomie/design';
import { Card, Button, Segmented, useLocale } from '@heyhomie/ui';
import { useCurrentCity } from '../lib/useCurrentCity';
import { track } from '../lib/analytics';
import { orderGateway, type SubmitOrderResult } from '@heyhomie/api';

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function Stepper({ label, hint, value, min = 0, onChange }: { label: string; hint?: string; value: number; min?: number; onChange: (v: number) => void }) {
    return (
        <View style={styles.stepper}>
            <View>
                <Text style={styles.stepLabel}>{label}</Text>
                {hint ? <Text style={styles.stepHint}>{hint}</Text> : null}
            </View>
            <View style={styles.stepCtrl}>
                <Pressable style={styles.stepBtn} onPress={() => onChange(Math.max(min, value - 1))}>
                    <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepValue}>{value}</Text>
                <Pressable style={styles.stepBtn} onPress={() => onChange(value + 1)}>
                    <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
            </View>
        </View>
    );
}

const Toggle = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress}>
        <Card style={styles.addon}>
            <Text style={[styles.addonName, { flex: 1 }]}>{label}</Text>
            <View style={[styles.check, on && styles.checkOn]}>{on ? <Ionicons name="checkmark" size={14} color={colors.primary} /> : null}</View>
        </Card>
    </Pressable>
);

/** A labelled row with a value on the right — matches the "Duration / Date / Address" reference style. */
const DetailRow = ({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) => (
    <View style={styles.detailRow}>
        <View style={styles.detailLeft}>
            <Ionicons name={icon} size={16} color={colors.grey} />
            <Text style={styles.detailLabel}>{label}</Text>
        </View>
        <Text style={styles.detailValue}>{value}</Text>
    </View>
);

/** Collapsible "About this service" — long description + a what's-included list. */
function ServiceDetails({ detail, locale, open, onToggle }: { detail: ServiceDetail; locale: Locale; open: boolean; onToggle: () => void }) {
    return (
        <View style={{ marginTop: spacing.sm }}>
            <Pressable style={styles.detailsHead} onPress={onToggle}>
                <View style={styles.detailsHeadLeft}>
                    <Ionicons name="information-circle-outline" size={16} color={colors.blue} />
                    <Text style={styles.detailsHeadText}>About this service</Text>
                </View>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.grey} />
            </Pressable>
            {open ? (
                <Card variant="fill" style={{ marginTop: spacing.sm }}>
                    <Text style={styles.detailsDesc}>{detail.description[locale]}</Text>
                    {detail.highlights[locale].map(h => (
                        <View key={h} style={styles.detailsRow}>
                            <Ionicons name="checkmark-circle" size={15} color={colors.salad} />
                            <Text style={styles.detailsItem}>{h}</Text>
                        </View>
                    ))}
                </Card>
            ) : null}
        </View>
    );
}

/* ------------------------------------------------------------------ */
/* Apartment size — draggable slider, 18–250 m², informational only    */
/* (feeds the existing team-size rule; never changes the price)        */
/* ------------------------------------------------------------------ */

const SQM_MIN = 18;
const SQM_MAX = 250;
const SQM_DEFAULT = 60;

function SqmSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const trackRef = useRef<View>(null);
    const trackX = useRef(0);
    const trackWidth = useRef(1);

    const updateFromPageX = (pageX: number) => {
        const ratio = Math.min(1, Math.max(0, (pageX - trackX.current) / trackWidth.current));
        onChange(Math.round(SQM_MIN + ratio * (SQM_MAX - SQM_MIN)));
    };

    const responder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: e => {
                trackRef.current?.measureInWindow((x, _y, w) => {
                    trackX.current = x;
                    trackWidth.current = Math.max(1, w);
                    updateFromPageX(e.nativeEvent.pageX);
                });
            },
            onPanResponderMove: e => updateFromPageX(e.nativeEvent.pageX),
        }),
    ).current;

    const pct = ((value - SQM_MIN) / (SQM_MAX - SQM_MIN)) * 100;

    return (
        <View>
            <View
                ref={trackRef}
                style={styles.sqmTrack}
                onLayout={() => trackRef.current?.measureInWindow((x, _y, w) => { trackX.current = x; trackWidth.current = Math.max(1, w); })}
                {...responder.panHandlers}
            >
                <View style={[styles.sqmFill, { width: `${pct}%` }]} />
                <View style={[styles.sqmThumb, { left: `${pct}%` }]} />
            </View>
            <View style={styles.sqmScaleRow}>
                <Text style={styles.sqmScaleText}>{SQM_MIN} m²</Text>
                <Text style={styles.sqmScaleText}>{SQM_MAX} m²</Text>
            </View>
        </View>
    );
}

/* ------------------------------------------------------------------ */
/* Trust signals — the "big company" reassurance cues                  */
/* Copy is company info, not user data; the cancellation line reflects */
/* the real 24h / 50% policy from scheduling.ts.                       */
/* ------------------------------------------------------------------ */

const TRUST_BADGES: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
    { icon: 'shield-checkmark', label: 'Insured & vetted homies' },
    { icon: 'leaf', label: 'Eco-friendly products' },
    { icon: 'ribbon', label: 'Satisfaction guarantee' },
    { icon: 'lock-closed', label: 'Secure payment' },
];

function TrustStrip() {
    return (
        <View style={styles.trustWrap}>
            <View style={styles.trustHeader}>
                <View style={styles.starsRow}>
                    {[0, 1, 2, 3, 4].map(i => <Ionicons key={i} name="star" size={13} color={colors.warning} />)}
                </View>
                <Text style={styles.trustHeaderText}>4.9 · Kraków's #1 rated cleaning service</Text>
            </View>
            <View style={styles.trustGrid}>
                {TRUST_BADGES.map(b => (
                    <View key={b.label} style={styles.trustItem}>
                        <View style={styles.trustIconWrap}>
                            <Ionicons name={b.icon} size={16} color={colors.blue} />
                        </View>
                        <Text style={styles.trustLabel}>{b.label}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

const PRESETS = [
    { key: 'studio', label: 'Studio', rooms: 1, kitchens: 1, bathrooms: 1 },
    { key: '1bed', label: '1-bed', rooms: 2, kitchens: 1, bathrooms: 1, popular: true },
    { key: '2bed', label: '2-bed', rooms: 3, kitchens: 1, bathrooms: 1 },
    { key: '3bed', label: '3-bed', rooms: 4, kitchens: 1, bathrooms: 2 },
];

const UNIT_HINT: Record<ServiceDef['unit'], string> = {
    hour: 'Charged by time',
    window: 'Charged per window',
    item: 'Charged per item',
    order: 'Charged per order',
};

/* Local-parts date formatting — toISOString would shift the day across timezones. */
const toYMD = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const tomorrowYMD = (): string => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toYMD(d);
};
/** "Sun, 01 Jun" — noon anchor avoids TZ edge cases when parsing back. */
const prettyDate = (ymd: string): string =>
    new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });

type ViewMode = 'cleaning' | 'browsing' | 'selected';

export default function Book() {
    const locale = useLocale();
    const map = demoAvailability;
    const cityIds = useMemo(() => enabledCities(map), [map]);
    const homeCity = demoMissions[0]?.address.city ?? cityIds[0];

    const [cityId, setCityId] = useState<string>(initialCity(map, null, cityIds.includes(homeCity) ? homeCity : cityIds[0]));
    const [serviceId, setServiceId] = useState<string>('standard_cleaning');
    const [citySettled, setCitySettled] = useState(false);
    // Cleaning is the default, primary flow (our core, highest-revenue service).
    // Other services live one tap away, not competing for the same visual weight.
    const [viewMode, setViewMode] = useState<ViewMode>('cleaning');

    const services = useMemo(
        () => sortedServiceIds(availableServices(map, cityId)).map(serviceById).filter((s): s is ServiceDef => !!s),
        [map, cityId],
    );
    const cleaningServices = useMemo(() => services.filter(s => s.category === 'cleaning'), [services]);
    const otherServices = useMemo(() => services.filter(s => s.category !== 'cleaning'), [services]);
    const hasCleaning = cleaningServices.length > 0;

    const activeId = services.some(s => s.id === serviceId) ? serviceId : services[0]?.id;
    const activeService = services.find(s => s.id === activeId);
    const isCleaning = activeId === 'standard_cleaning' || activeId === 'general_cleaning';
    const isLead = !!activeId && isLeadService(activeId);
    const isFlower = activeId === 'flower_delivery';
    const plan: CleaningPlan = activeId === 'general_cleaning' ? 'general' : 'standard';

    // Cadence — options depend on the service (cleaning=4, flower=delivery set, rest=one-off).
    const freqs = useMemo(() => (activeId ? frequenciesFor(activeId) : []), [activeId]);
    const [frequency, setFrequency] = useState<Frequency>('once');
    useEffect(() => {
        if (freqs.length && !freqs.includes(frequency)) setFrequency(freqs[0]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeId]);

    const applyCity = (id: string) => {
        setCityId(id);
        const cleaningHere = sortedServiceIds(availableServices(map, id)).map(serviceById).find(s => s?.category === 'cleaning');
        if (cleaningHere) {
            setServiceId(cleaningHere.id);
            setViewMode('cleaning');
        } else {
            const firstId = sortedServiceIds(availableServices(map, id))[0];
            if (firstId) setServiceId(firstId);
            setViewMode('selected');
        }
    };
    const pickCity = (id: string) => {
        setCitySettled(true);
        applyCity(id);
    };
    const pickPlan = (id: string) => {
        setCitySettled(true);
        setServiceId(id);
        setViewMode('cleaning');
        track({ name: 'funnel_step', stage: 'service_selected', serviceId: id });
    };
    const pickOtherService = (id: string) => {
        setCitySettled(true);
        setServiceId(id);
        setViewMode('selected');
        track({ name: 'funnel_step', stage: 'service_selected', serviceId: id });
    };
    const backToCleaning = () => {
        const first = cleaningServices[0];
        if (first) setServiceId(first.id);
        setViewMode('cleaning');
    };

    // Booking-screen analytics (feeds product analytics + heatmaps).
    useEffect(() => {
        track({ name: 'screen_view', screen: 'book' });
        track({ name: 'funnel_step', stage: 'started' });
    }, []);

    // Auto-select the client's city from device location (falls back silently).
    const detected = useCurrentCity(map);
    useEffect(() => {
        if (citySettled || detected.status === 'detecting') return;
        if (detected.cityId) applyCity(detected.cityId);
        setCitySettled(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [detected.status, detected.cityId, citySettled]);

    const locationHint =
        detected.status === 'detecting'
            ? 'Detecting your city…'
            : detected.status === 'ok' && detected.cityId === cityId
              ? 'Set from your location'
              : detected.status === 'unsupported'
                ? "We're not in your area yet — pick a city to explore"
                : "Don't see your city? We're expanding — more launching soon.";

    // Cleaning config
    const [rooms, setRooms] = useState(2);
    const [kitchens, setKitchens] = useState(1);
    const [bathrooms, setBathrooms] = useState(1);
    const [areaSqm, setAreaSqm] = useState(SQM_DEFAULT);
    const [selected, setSelected] = useState<Record<string, number>>({});
    const [pets, setPets] = useState(false);
    // Cleaning-only: does the client already have a mop + vacuum at home?
    const [mopPresent, setMopPresent] = useState(true);
    const [vacuumPresent, setVacuumPresent] = useState(true);

    // Company invoice — off by default; one toggle reveals the fields.
    const [wantInvoice, setWantInvoice] = useState(false);
    const [billing, setBilling] = useState<Partial<BillingDetails>>({});
    const billingCheck = validateBilling(billing);
    const billingBlocks = wantInvoice && !billingCheck.valid;
    const setBill = (k: keyof BillingDetails, v: string) => setBilling(prev => ({ ...prev, [k]: v }));

    // Flower delivery — recipient, address (in the chosen city), date + slot, gift note.
    const [dName, setDName] = useState('');
    const [dPhone, setDPhone] = useState('');
    const [dLine1, setDLine1] = useState('');
    // Smart default: tomorrow (earliest slot a florist can realistically fulfil).
    const [dDate, setDDate] = useState(tomorrowYMD);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [dSlot, setDSlot] = useState<DeliverySlotId>('morning');
    const [dNote, setDNote] = useState('');
    const deliveryDetails: Partial<DeliveryDetails> = {
        recipientName: dName,
        recipientPhone: dPhone || undefined,
        line1: dLine1,
        city: cityId,
        date: dDate,
        slot: dSlot,
        note: dNote || undefined,
    };
    const deliveryCheck = validateDelivery(deliveryDetails);
    const deliveryBlocks = isFlower && !deliveryCheck.valid;

    // Lead services (office / post-renovation): leave a callback number.
    const [leadPhone, setLeadPhone] = useState('');
    const [leadSending, setLeadSending] = useState(false);
    const [leadSent, setLeadSent] = useState(false);
    const leadPhoneValid = isValidPolishPhone(leadPhone);

    const onRequestCallback = async () => {
        if (!activeId || !leadPhoneValid) return;
        setLeadSending(true);
        try {
            await orderGateway.captureLead({ phone: leadPhone, serviceId: activeId, cityId });
            track({ name: 'lead_captured', source: 'callback', serviceId: activeId });
            setLeadSent(true);
        } finally {
            setLeadSending(false);
        }
    };

    // Identity — returning users are already signed in (OTP by phone/email); a
    // new user gives minimal contact (phone preferred), name optional.
    const loggedIn = false; // demo: treat as a new, signed-out visitor
    const [contact, setContact] = useState<Contact>({});
    const [firstName, setFirstName] = useState('');
    const signupCheck = validateSignup(contact);
    const contactBlocks = !loggedIn && !signupCheck.valid;
    const setContactField = (k: keyof Contact, v: string) => setContact(prev => ({ ...prev, [k]: v }));

    // Payment method — card now, or pay later via an emailed link.
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');

    // Expandable "About this service" details.
    const [showDetails, setShowDetails] = useState(false);
    const details = activeId ? serviceDetail(activeId) : undefined;

    // Submit — end-to-end mock (account + confirmed draft + first notification).
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState<SubmitOrderResult | null>(null);

    const available = addOnsFor(plan);
    const availableIds = useMemo(() => new Set(available.map(a => a.id)), [available]);
    const selectedArr: SelectedAddOn[] = Object.entries(selected)
        .filter(([id]) => availableIds.has(id as AddOnId))
        .map(([id, quantity]) => ({ id: id as AddOnId, quantity }));
    const minutes = estimateMissionMinutes({ rooms, kitchens, bathrooms }, selectedArr);
    // Team size follows the real staffing rule (general => 2, unless <=60m² or recurring).
    const workers = workersFor(plan, { areaSqm, recurring: frequency !== 'once' });

    const onContinue = async () => {
        if (!activeId) return;
        track({ name: 'funnel_step', stage: 'confirmed', serviceId: activeId });
        if (isCleaning) track({ name: 'mission_booked', plan, minutes, addOns: selectedArr.length });
        setSubmitting(true);
        try {
            const result = await orderGateway.submitOrder({
                contact,
                firstName,
                cityId,
                serviceId: activeId,
                estValue: undefined,
                delivery: isFlower && deliveryCheck.valid ? (deliveryDetails as DeliveryDetails) : undefined,
                paymentMethod,
            });
            setSubmitted(result);
        } finally {
            setSubmitting(false);
        }
    };

    const toggle = (id: AddOnId) =>
        setSelected(prev => {
            const next = { ...prev };
            if (next[id]) delete next[id];
            else next[id] = 1;
            return next;
        });
    const setQty = (id: AddOnId, q: number) => setSelected(prev => ({ ...prev, [id]: Math.max(1, q) }));

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Book cleaning' }} />
            <ScrollView contentContainerStyle={styles.body}>
                {submitted ? (
                    <Card variant="fill" style={styles.successCard}>
                        <View style={styles.successIconOuter}>
                            <View style={styles.successIconInner}>
                                <Ionicons name="checkmark" size={30} color={colors.primary} />
                            </View>
                        </View>
                        <Text style={styles.successTitle}>You're booked!</Text>
                        <Text style={styles.successText}>
                            {submitted.isNewAccount ? `Welcome, ${submitted.account.firstName}! ` : `Welcome back, ${submitted.account.firstName}! `}
                            We sent a confirmation to {submitted.account.phone ?? submitted.account.email}.
                        </Text>
                        {submitted.isNewAccount ? (
                            <View style={styles.successNoteRow}>
                                <Ionicons name="shield-checkmark" size={16} color={colors.success} />
                                <Text style={styles.successNote}>Account created — confirm with the one-time code. No password needed.</Text>
                            </View>
                        ) : null}
                        <View style={styles.successNoteRow}>
                            <Ionicons name={submitted.payment.method === 'card' ? 'card-outline' : 'mail-outline'} size={16} color={colors.blue} />
                            <Text style={styles.successNote}>
                                {submitted.payment.method === 'pay_later'
                                    ? 'You pay after the cleaning — we email a payment link the next morning. Track its status in Activity.'
                                    : 'You pay after the cleaning — we auto-charge your card the next morning. No charge until the visit is done.'}
                            </Text>
                        </View>
                        <Button label="Book another" variant="ghost" style={{ marginTop: spacing.lg }} onPress={() => setSubmitted(null)} />
                    </Card>
                ) : (
                <>
                <TrustStrip />

                <Text style={styles.section}>City</Text>
                <View style={styles.cityChips}>
                    {cityIds.map(id => {
                        const on = id === cityId;
                        return (
                            <Pressable key={id} onPress={() => pickCity(id)} style={[styles.cityChip, on && styles.cityChipOn]}>
                                <Text style={[styles.cityChipText, on && styles.cityChipTextOn]}>{cityName(id, locale)}</Text>
                            </Pressable>
                        );
                    })}
                </View>
                <View style={styles.locationHintRow}>
                    <Ionicons name="location" size={12} color={colors.grey} />
                    <Text style={styles.waitlist}>{locationHint}</Text>
                </View>

                {viewMode === 'cleaning' && hasCleaning ? (
                    <>
                        {cleaningServices.length > 1 ? (
                            <View style={{ marginTop: spacing.lg }}>
                                <Segmented
                                    value={activeId ?? cleaningServices[0].id}
                                    onChange={pickPlan}
                                    options={cleaningServices.map(s => ({ key: s.id, label: s.id === 'general_cleaning' ? 'Deep' : 'Standard' }))}
                                />
                            </View>
                        ) : null}

                        {otherServices.length > 0 ? (
                            <Pressable style={styles.exploreRow} onPress={() => setViewMode('browsing')}>
                                <View style={styles.exploreLeft}>
                                    <Text style={styles.exploreIcons}>{otherServices.slice(0, 3).map(s => serviceIcon(s.id)).join(' ')}</Text>
                                    <Text style={styles.exploreText}>Need something else? Windows, flowers & more</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={16} color={colors.grey} />
                            </Pressable>
                        ) : null}

                        {details ? <ServiceDetails detail={details} locale={locale} open={showDetails} onToggle={() => setShowDetails(v => !v)} /> : null}

                        {freqs.length > 1 ? (
                            <>
                                <Text style={styles.section}>How often?</Text>
                                <View style={styles.freqWrap}>
                                    {freqs.map(f => {
                                        const on = f === frequency;
                                        return (
                                            <Pressable key={f} onPress={() => setFrequency(f)} style={[styles.freqChip, on && styles.freqChipOn]}>
                                                <Text style={[styles.freqChipText, on && styles.freqChipTextOn]}>{tr(frequencyLabel[f], locale)}</Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </>
                        ) : null}

                        <Text style={styles.section}>Quick start</Text>
                        <View style={styles.presets}>
                            {PRESETS.map(p => {
                                const active = rooms === p.rooms && kitchens === p.kitchens && bathrooms === p.bathrooms;
                                return (
                                    <Pressable
                                        key={p.key}
                                        onPress={() => {
                                            setRooms(p.rooms);
                                            setKitchens(p.kitchens);
                                            setBathrooms(p.bathrooms);
                                        }}
                                        style={[styles.preset, active && styles.presetOn]}
                                    >
                                        <Text style={[styles.presetText, active && styles.presetTextOn]}>{p.label}</Text>
                                        {p.popular ? <Text style={styles.popular}>popular</Text> : null}
                                    </Pressable>
                                );
                            })}
                        </View>

                        <Text style={styles.section}>Your home</Text>
                        <Card variant="fill">
                            <Stepper label="Rooms" hint="30 min each" value={rooms} onChange={setRooms} />
                            <Stepper label="Kitchens" hint="60 min each" value={kitchens} min={1} onChange={setKitchens} />
                            <Stepper label="Bathrooms" hint="60 min each" value={bathrooms} min={1} onChange={setBathrooms} />
                        </Card>

                        <View style={styles.sqmHeader}>
                            <Text style={styles.section}>Apartment size</Text>
                            <Text style={styles.sqmValue}>{areaSqm} m²</Text>
                        </View>
                        <Card>
                            <SqmSlider value={areaSqm} onChange={setAreaSqm} />
                            <Text style={styles.sqmNote}>Helps us plan the right team size — your price stays the same.</Text>
                        </Card>

                        <Text style={styles.section}>Add-ons</Text>
                        {available.map(a => {
                            const on = !!selected[a.id];
                            const quantifiable = a.pricing !== 'flat';
                            return (
                                <Pressable key={a.id} onPress={() => toggle(a.id)}>
                                    <Card style={[styles.addon, on && styles.addonOn]}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.addonName}>{tr(a.label, locale)}</Text>
                                            <Text style={styles.addonMeta}>
                                                +{a.addedMinutesPerUnit} min{quantifiable ? ` · per ${tr(a.unitLabel ?? a.label, locale)}` : ''}
                                            </Text>
                                        </View>
                                        {on && quantifiable ? (
                                            <View style={styles.stepCtrl}>
                                                <Pressable style={styles.stepBtn} onPress={() => setQty(a.id, (selected[a.id] ?? 1) - 1)}>
                                                    <Text style={styles.stepBtnText}>−</Text>
                                                </Pressable>
                                                <Text style={styles.stepValue}>{selected[a.id]}</Text>
                                                <Pressable style={styles.stepBtn} onPress={() => setQty(a.id, (selected[a.id] ?? 1) + 1)}>
                                                    <Text style={styles.stepBtnText}>+</Text>
                                                </Pressable>
                                            </View>
                                        ) : (
                                            <View style={[styles.check, on && styles.checkOn]}>{on ? <Ionicons name="checkmark" size={14} color={colors.primary} /> : null}</View>
                                        )}
                                    </Card>
                                </Pressable>
                            );
                        })}

                        <Text style={styles.section}>At the apartment</Text>
                        <Toggle label="Mop & bucket available" on={mopPresent} onPress={() => setMopPresent(v => !v)} />
                        <Toggle label="Vacuum cleaner available" on={vacuumPresent} onPress={() => setVacuumPresent(v => !v)} />
                        {!mopPresent || !vacuumPresent ? (
                            <Text style={styles.sumNote}>No problem — your homie brings the equipment that's missing.</Text>
                        ) : null}
                        <Toggle label="Pets at home (info only)" on={pets} onPress={() => setPets(v => !v)} />

                        <Card variant="fill" style={{ marginTop: spacing.lg }}>
                            <DetailRow icon="time-outline" label="Estimated time" value={formatDuration(minutes)} />
                            <DetailRow icon="people-outline" label="Homies assigned" value={String(workers)} />
                            <DetailRow icon="resize-outline" label="Apartment size" value={`${areaSqm} m²`} />
                            <Text style={styles.sumNote}>+{TRAVEL_BUFFER_MINUTES} min travel buffer · price calculated at checkout</Text>
                        </Card>
                    </>
                ) : null}

                {viewMode === 'browsing' ? (
                    <>
                        <Pressable style={styles.backRow} onPress={backToCleaning}>
                            <Ionicons name="chevron-back" size={16} color={colors.primary} />
                            <Text style={styles.backText}>Back to cleaning</Text>
                        </Pressable>
                        <Text style={styles.section}>Other services in {cityName(cityId, locale)}</Text>
                        <View style={styles.otherGrid}>
                            {otherServices.map(s => (
                                <Pressable key={s.id} onPress={() => pickOtherService(s.id)} style={styles.otherTile}>
                                    <Text style={styles.otherIcon}>{serviceIcon(s.id)}</Text>
                                    <Text style={styles.otherName}>{s.names[locale]}</Text>
                                    <Text style={styles.otherTagline} numberOfLines={2}>{s.tagline[locale]}</Text>
                                </Pressable>
                            ))}
                        </View>
                    </>
                ) : null}

                {viewMode === 'selected' && activeService && !isCleaning ? (
                    <>
                        {hasCleaning ? (
                            <Pressable style={styles.backRow} onPress={backToCleaning}>
                                <Ionicons name="chevron-back" size={16} color={colors.primary} />
                                <Text style={styles.backText}>Back to cleaning</Text>
                            </Pressable>
                        ) : null}

                        {details ? <ServiceDetails detail={details} locale={locale} open={showDetails} onToggle={() => setShowDetails(v => !v)} /> : null}

                        {isLead ? (
                            // Office / post-renovation — not booked in-app; route to a manager.
                            <Card variant="fill" style={styles.leadCard}>
                                <Text style={styles.infoTitle}>{activeService.names[locale]}</Text>
                                <Text style={styles.infoText}>{activeService.tagline[locale]}</Text>
                                <Text style={styles.leadNote}>Quoted individually. Call us, or leave your number and a manager will reach out to agree the scope and price.</Text>
                                <Button
                                    label={`Call ${CONTACT_PHONE}`}
                                    variant="teal"
                                    style={{ marginTop: spacing.md }}
                                    onPress={() => Linking.openURL(`tel:${CONTACT_PHONE.replace(/\s/g, '')}`)}
                                />
                                {leadSent ? (
                                    <View style={styles.leadSentRow}>
                                        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                                        <Text style={styles.leadSentText}>Got it — a manager will call you back within one business day. We've texted a confirmation.</Text>
                                    </View>
                                ) : (
                                    <>
                                        <Text style={styles.section}>…or leave your number</Text>
                                        <TextInput
                                            style={styles.tInput}
                                            placeholder="Phone (+48…)"
                                            placeholderTextColor={colors.grey}
                                            keyboardType="phone-pad"
                                            value={leadPhone}
                                            onChangeText={setLeadPhone}
                                        />
                                        <Button
                                            label={leadSending ? 'Sending…' : 'Request a callback'}
                                            variant="ghost"
                                            disabled={!leadPhoneValid || leadSending}
                                            style={{ marginTop: spacing.md }}
                                            onPress={onRequestCallback}
                                        />
                                    </>
                                )}
                            </Card>
                        ) : (
                            <>
                                {freqs.length > 1 ? (
                                    <>
                                        <Text style={styles.section}>How often?</Text>
                                        <View style={styles.freqWrap}>
                                            {freqs.map(f => {
                                                const on = f === frequency;
                                                return (
                                                    <Pressable key={f} onPress={() => setFrequency(f)} style={[styles.freqChip, on && styles.freqChipOn]}>
                                                        <Text style={[styles.freqChipText, on && styles.freqChipTextOn]}>{tr(frequencyLabel[f], locale)}</Text>
                                                    </Pressable>
                                                );
                                            })}
                                        </View>
                                    </>
                                ) : null}
                                {isFlower ? (
                                    <>
                                        <Text style={styles.section}>Who receives the flowers?</Text>
                                        <Card>
                                            <TextInput style={styles.tInput} placeholder="Recipient name" placeholderTextColor={colors.grey} value={dName} onChangeText={setDName} />
                                            <TextInput style={styles.tInput} placeholder="Recipient phone (optional, +48…)" placeholderTextColor={colors.grey} keyboardType="phone-pad" value={dPhone} onChangeText={setDPhone} />
                                            <TextInput style={[styles.tInput, { marginBottom: 0 }]} placeholder={`Street and number in ${cityName(cityId, locale)}`} placeholderTextColor={colors.grey} value={dLine1} onChangeText={setDLine1} />
                                            {dPhone.length > 0 && !deliveryCheck.phoneValid ? <Text style={styles.err}>Invalid Polish phone number</Text> : null}
                                        </Card>

                                        <Text style={styles.section}>When?</Text>
                                        <Card>
                                            {Platform.OS === 'web' ? (
                                                // datetimepicker has no web implementation — plain input there.
                                                <TextInput style={styles.tInput} placeholder="Date (YYYY-MM-DD)" placeholderTextColor={colors.grey} value={dDate} onChangeText={setDDate} />
                                            ) : (
                                                <>
                                                    <Pressable style={styles.dateRow} onPress={() => setShowDatePicker(v => !v)}>
                                                        <View style={styles.dateLeft}>
                                                            <Ionicons name="calendar-outline" size={16} color={colors.blue} />
                                                            <Text style={styles.dateValue}>{prettyDate(dDate)}</Text>
                                                        </View>
                                                        <Ionicons name={showDatePicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.grey} />
                                                    </Pressable>
                                                    {showDatePicker ? (
                                                        <DateTimePicker
                                                            value={new Date(`${dDate}T12:00:00`)}
                                                            mode="date"
                                                            display={Platform.OS === 'ios' ? 'inline' : 'default'}
                                                            minimumDate={new Date()}
                                                            onChange={(_e: unknown, selected?: Date) => {
                                                                // Android's dialog closes itself; keep the iOS inline calendar open.
                                                                setShowDatePicker(Platform.OS === 'ios');
                                                                if (selected) setDDate(toYMD(selected));
                                                            }}
                                                        />
                                                    ) : null}
                                                </>
                                            )}
                                            <View style={styles.slotRow}>
                                                {DELIVERY_SLOTS.map(s => {
                                                    const on = s.id === dSlot;
                                                    return (
                                                        <Pressable key={s.id} onPress={() => setDSlot(s.id)} style={[styles.slotChip, on && styles.slotChipOn]}>
                                                            <Text style={[styles.slotLabel, on && styles.slotLabelOn]}>{tr(s.label, locale)}</Text>
                                                            <Text style={[styles.slotWindow, on && styles.slotLabelOn]}>{s.window}</Text>
                                                        </Pressable>
                                                    );
                                                })}
                                            </View>
                                        </Card>

                                        <Text style={styles.section}>Gift note (printed on the card)</Text>
                                        <Card>
                                            <TextInput
                                                style={[styles.tInput, styles.noteInput]}
                                                placeholder="Your message…"
                                                placeholderTextColor={colors.grey}
                                                value={dNote}
                                                onChangeText={t => setDNote(t.slice(0, DELIVERY_NOTE_MAX))}
                                                multiline
                                            />
                                            <Text style={styles.noteCount}>{dNote.length}/{DELIVERY_NOTE_MAX}</Text>
                                        </Card>
                                        <Text style={styles.sumNote}>Price confirmed at checkout — depends on the bouquet you pick with our florist.</Text>
                                    </>
                                ) : (
                                    <Card variant="fill" style={{ marginTop: spacing.md }}>
                                        <Text style={styles.infoTitle}>{activeService.names[locale]}</Text>
                                        <Text style={styles.infoText}>{activeService.tagline[locale]}</Text>
                                        <Text style={styles.sumNote}>{UNIT_HINT[activeService.unit]} · we'll confirm the scope and price at checkout.</Text>
                                    </Card>
                                )}
                            </>
                        )}
                    </>
                ) : null}

                {activeService && (viewMode === 'cleaning' || viewMode === 'selected') ? (
                    <>
                        {/* Company invoice — one yes/no toggle, fields only if the client wants a faktura. */}
                        <Text style={styles.section}>Invoice</Text>
                        <Toggle label="I need an invoice for a company" on={wantInvoice} onPress={() => setWantInvoice(v => !v)} />
                        {wantInvoice ? (
                            <Card style={{ marginTop: spacing.sm }}>
                                <TextInput style={styles.tInput} placeholder="Company name" placeholderTextColor={colors.grey} value={billing.companyName ?? ''} onChangeText={t => setBill('companyName', t)} />
                                <TextInput style={styles.tInput} placeholder="NIP (10 digits)" placeholderTextColor={colors.grey} keyboardType="number-pad" value={billing.nip ?? ''} onChangeText={t => setBill('nip', t)} />
                                <TextInput style={styles.tInput} placeholder="Street and number" placeholderTextColor={colors.grey} value={billing.line1 ?? ''} onChangeText={t => setBill('line1', t)} />
                                <View style={styles.billRow}>
                                    <TextInput style={[styles.tInput, styles.billZip]} placeholder="00-000" placeholderTextColor={colors.grey} value={billing.zipCode ?? ''} onChangeText={t => setBill('zipCode', t)} />
                                    <TextInput style={[styles.tInput, { flex: 1, marginLeft: spacing.sm }]} placeholder="City" placeholderTextColor={colors.grey} value={billing.city ?? ''} onChangeText={t => setBill('city', t)} />
                                </View>
                                <TextInput style={styles.tInput} placeholder="Email for the invoice (optional)" placeholderTextColor={colors.grey} keyboardType="email-address" value={billing.email ?? ''} onChangeText={t => setBill('email', t)} />
                                {(billing.nip ?? '').length > 0 && !billingCheck.nipValid ? <Text style={styles.err}>Invalid NIP checksum</Text> : null}
                            </Card>
                        ) : null}

                        {/* Contact — only for signed-out visitors; minimal fields, name optional. */}
                        {!loggedIn ? (
                            <>
                                <Text style={styles.section}>Your contact</Text>
                                <Card>
                                    <TextInput
                                        style={styles.tInput}
                                        placeholder="Phone (+48…)"
                                        placeholderTextColor={colors.grey}
                                        keyboardType="phone-pad"
                                        value={contact.phone ?? ''}
                                        onChangeText={t => setContactField('phone', t)}
                                    />
                                    <TextInput
                                        style={styles.tInput}
                                        placeholder="Email (optional)"
                                        placeholderTextColor={colors.grey}
                                        keyboardType="email-address"
                                        value={contact.email ?? ''}
                                        onChangeText={t => setContactField('email', t)}
                                    />
                                    <TextInput
                                        style={[styles.tInput, { marginBottom: 0 }]}
                                        placeholder="First name (optional)"
                                        placeholderTextColor={colors.grey}
                                        value={firstName}
                                        onChangeText={setFirstName}
                                    />
                                    <View style={styles.contactHintRow}>
                                        <Ionicons name="shield-checkmark-outline" size={13} color={colors.grey} />
                                        <Text style={styles.contactHint}>We'll send a one-time code to confirm — no password needed.</Text>
                                    </View>
                                </Card>
                            </>
                        ) : null}

                        {/* Payment — card now, or an emailed pay-later link. */}
                        <Text style={styles.section}>Payment</Text>
                        {PAYMENT_METHODS.map(pm => {
                            const on = pm.id === paymentMethod;
                            return (
                                <Pressable key={pm.id} onPress={() => setPaymentMethod(pm.id)}>
                                    <Card style={[styles.payRow, on && styles.payRowOn]}>
                                        <Ionicons
                                            name={pm.id === 'card' ? 'card-outline' : 'time-outline'}
                                            size={20}
                                            color={on ? colors.primary : colors.grey}
                                        />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.payLabel}>{tr(pm.label, locale)}</Text>
                                            <Text style={styles.payBlurb}>{tr(pm.blurb, locale)}</Text>
                                        </View>
                                        <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                                    </Card>
                                </Pressable>
                            );
                        })}
                        <View style={styles.reassureRow}>
                            <Ionicons name="lock-closed-outline" size={13} color={colors.grey} />
                            <Text style={styles.reassureText}>You're only charged after the cleaning is done · secured by Stripe</Text>
                        </View>

                        <Button
                            label={submitting ? 'Booking…' : 'Continue'}
                            variant="teal"
                            disabled={billingBlocks || contactBlocks || deliveryBlocks || submitting}
                            style={{ marginTop: spacing.lg }}
                            onPress={onContinue}
                        />
                        <View style={styles.reassureRow}>
                            <Ionicons name="calendar-outline" size={13} color={colors.grey} />
                            <Text style={styles.reassureText}>Free rescheduling · a fee only applies if canceled under {CANCELLATION_WINDOW_HOURS}h before</Text>
                        </View>
                    </>
                ) : null}
                </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.lg, marginBottom: spacing.sm },

    /* Trust strip */
    trustWrap: { backgroundColor: colors.bgLight, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md },
    trustHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
    starsRow: { flexDirection: 'row', gap: 1 },
    trustHeaderText: { fontSize: typography.sizes.caption, color: colors.primary, fontWeight: '600' },
    trustGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    trustItem: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '47%' },
    trustIconWrap: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
    trustLabel: { fontSize: 11, color: colors.grey, flex: 1, lineHeight: 14 },

    cityChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    cityChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
    cityChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    cityChipText: { color: colors.grey, fontSize: typography.sizes.small, fontWeight: '600' },
    cityChipTextOn: { color: colors.white },
    locationHintRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
    waitlist: { color: colors.grey, fontSize: typography.sizes.caption },

    /* Explore-other-services entry row */
    exploreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgLight, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.md },
    exploreLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
    exploreIcons: { fontSize: 16 },
    exploreText: { fontSize: typography.sizes.caption, color: colors.primary, fontWeight: '500', flex: 1 },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.md },
    backText: { fontSize: typography.sizes.small, color: colors.primary, fontWeight: '600' },
    otherGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    otherTile: { width: '31%', borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: spacing.sm, alignItems: 'center' },
    otherIcon: { fontSize: 24, marginBottom: 4 },
    otherName: { fontSize: 11, fontWeight: '600', color: colors.primary, textAlign: 'center' },
    otherTagline: { fontSize: 10, color: colors.grey, textAlign: 'center', marginTop: 2 },

    /* Apartment size slider */
    sqmHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    sqmValue: { color: colors.primary, fontWeight: '700', fontSize: typography.sizes.small, marginTop: spacing.lg, marginBottom: spacing.sm },
    sqmTrack: { height: 6, borderRadius: 3, backgroundColor: colors.bgLight, justifyContent: 'center', marginTop: spacing.sm },
    sqmFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.salad, borderRadius: 3 },
    sqmThumb: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.salad, marginLeft: -11 },
    sqmScaleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
    sqmScaleText: { fontSize: 10, color: colors.grey },
    sqmNote: { fontSize: typography.sizes.caption, color: colors.grey, marginTop: spacing.md, lineHeight: 15 },

    freqWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    freqChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
    freqChipOn: { backgroundColor: colors.salad, borderColor: colors.salad },
    freqChipText: { color: colors.grey, fontSize: typography.sizes.caption, fontWeight: '600' },
    freqChipTextOn: { color: colors.primary },
    infoTitle: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary },
    infoText: { fontSize: typography.sizes.small, color: colors.grey, marginTop: 4 },
    leadCard: { marginTop: spacing.md },
    leadNote: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.sm, lineHeight: 18 },
    leadSentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.lg },
    leadSentText: { flex: 1, color: colors.success, fontSize: typography.sizes.small, fontWeight: '600', lineHeight: 19 },
    dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm },
    dateLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    dateValue: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '600' },
    slotRow: { flexDirection: 'row', gap: spacing.sm },
    slotChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    slotChipOn: { backgroundColor: colors.salad, borderColor: colors.salad },
    slotLabel: { color: colors.grey, fontSize: typography.sizes.caption, fontWeight: '600' },
    slotLabelOn: { color: colors.primary },
    slotWindow: { color: colors.grey, fontSize: 10, marginTop: 2 },
    noteInput: { minHeight: 72, textAlignVertical: 'top', marginBottom: 4 },
    noteCount: { alignSelf: 'flex-end', color: colors.grey, fontSize: 10 },
    presets: { flexDirection: 'row', gap: spacing.sm },
    preset: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    presetOn: { backgroundColor: colors.salad, borderColor: colors.salad },
    presetText: { color: colors.grey, fontSize: typography.sizes.small, fontWeight: '600' },
    presetTextOn: { color: colors.primary },
    popular: { fontSize: 9, color: colors.primary, marginTop: 2 },
    stepper: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
    stepLabel: { fontSize: typography.sizes.body, color: colors.primary, fontWeight: '500' },
    stepHint: { fontSize: typography.sizes.caption, color: colors.grey },
    stepCtrl: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    stepBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    stepBtnText: { fontSize: 18, color: colors.primary },
    stepValue: { minWidth: 20, textAlign: 'center', fontSize: typography.sizes.body, fontWeight: '600', color: colors.primary },
    addon: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
    addonOn: { borderWidth: 1.5, borderColor: colors.salad },
    addonName: { fontSize: typography.sizes.small, fontWeight: '500', color: colors.primary },
    addonMeta: { fontSize: typography.sizes.caption, color: colors.grey, marginTop: 2 },
    check: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    checkOn: { backgroundColor: colors.salad, borderColor: colors.salad },
    tInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md, color: colors.primary, marginBottom: spacing.sm },
    billRow: { flexDirection: 'row' },
    billZip: { width: 110 },
    err: { color: colors.danger, fontSize: typography.sizes.caption },

    /* Detail rows (summary card) */
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
    detailLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailLabel: { color: colors.grey, fontSize: typography.sizes.small },
    detailValue: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '600' },
    sumNote: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 6 },

    contactHintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: spacing.sm },
    contactHint: { fontSize: typography.sizes.caption, color: colors.grey, lineHeight: 15, flex: 1 },
    reassureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: spacing.md },
    reassureText: { fontSize: 11, color: colors.grey, textAlign: 'center' },

    successCard: { alignItems: 'center', paddingVertical: spacing.xl },
    successIconOuter: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#E4FBF5', alignItems: 'center', justifyContent: 'center' },
    successIconInner: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.salad, alignItems: 'center', justifyContent: 'center' },
    successTitle: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginTop: spacing.md },
    successText: { fontSize: typography.sizes.small, color: colors.grey, textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 },
    successNoteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: colors.bgLight, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.md },
    successNote: { fontSize: typography.sizes.caption, color: colors.grey, lineHeight: 16, flex: 1 },

    detailsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
    detailsHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    detailsHeadText: { color: colors.blue, fontSize: typography.sizes.small, fontWeight: '600' },
    detailsDesc: { color: colors.primary, fontSize: typography.sizes.small, lineHeight: 20, marginBottom: spacing.sm },
    detailsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 3 },
    detailsItem: { color: colors.grey, fontSize: typography.sizes.small, flex: 1, lineHeight: 18 },

    payRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
    payRowOn: { borderWidth: 1.5, borderColor: colors.salad },
    payLabel: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '600' },
    payBlurb: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 1 },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    radioOn: { borderColor: colors.salad },
    radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.salad },
});
