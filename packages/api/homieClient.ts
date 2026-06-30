/**
 * Real Go API client for the worker (homie) app.
 * Endpoints mirror homie-api/routes/api_homie.go exactly.
 *
 * Response DTOs are intentionally generic for now — the precise shapes come from
 * the backend's generated Swagger (`make docs` in homie-api). Pass the expected
 * type at the call site, e.g. `homie.listMyMissions<Mission[]>()`.
 */
import { createHttp, type HttpConfig } from './http';
import { GO_PREFIX } from './config';

export interface SmsSignInPayload {
    phonenumber: string;
}
export interface SmsCheckPayload {
    phonenumber: string;
    otp: string;
}

export function createHomieClient(config: HttpConfig) {
    const http = createHttp(config);
    const p = GO_PREFIX.homie;

    return {
        // auth
        signInSms: (body: SmsSignInPayload) => http.post(`${p}/auth/signin-sms`, { body }),
        signUpSms: (body: SmsSignInPayload) => http.post(`${p}/auth/signup-sms`, { body }),
        signUpSmsCheck: <T = unknown>(body: SmsCheckPayload) => http.post<T>(`${p}/auth/signup-sms-check`, { body }),
        me: <T = unknown>() => http.get<T>(`${p}/auth/me`),
        logout: () => http.post(`${p}/auth/logout`),

        // verification
        verificationCheck: <T = unknown>() => http.get<T>(`${p}/verification/check`),
        verificationRetry: () => http.patch(`${p}/verification/retry`),

        // schedule
        listSchedule: <T = unknown>() => http.get<T>(`${p}/schedule/list`),
        createSchedule: (body: unknown) => http.post(`${p}/schedule`, { body }),
        updateSchedule: (id: string, body: unknown) => http.patch(`${p}/schedule/${id}`, { body }),
        deleteSchedule: (id: string) => http.del(`${p}/schedule/${id}`),

        // available (new) missions
        listAvailableMissions: <T = unknown>() => http.get<T>(`${p}/mission-available/list`),
        acceptMission: (id: string) => http.post(`${p}/mission-available/${id}/assign`),

        // my missions
        listMyMissions: <T = unknown>() => http.get<T>(`${p}/mission/list`),
        beginMission: (id: string) => http.post(`${p}/mission/${id}/begin`),
        completeMission: (id: string) => http.post(`${p}/mission/${id}/complete`),
        unassignMission: (id: string) => http.post(`${p}/mission/${id}/unassign`),

        // money
        balanceHistory: <T = unknown>() => http.get<T>(`${p}/balance/history`),
        listPaymentDetails: <T = unknown>() => http.get<T>(`${p}/payment-details/list`),
        createPaymentDetails: (body: unknown) => http.post(`${p}/payment-details`, { body }),
        setDefaultPaymentDetails: (id: string) => http.patch(`${p}/payment-details/${id}/set-default`),

        // reviews / profile / feedback
        listReviews: <T = unknown>() => http.get<T>(`${p}/review/list`),
        updateAccount: (body: unknown) => http.patch(`${p}/profile/account`, { body }),
        updateLanguage: (body: unknown) => http.patch(`${p}/profile/language`, { body }),
        sendFeedback: (body: unknown) => http.post(`${p}/feedback`, { body }),
    };
}

export type HomieClient = ReturnType<typeof createHomieClient>;
