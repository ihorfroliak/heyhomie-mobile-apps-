/**
 * HR — worker contracts lifecycle. Two engagement types under Polish law:
 * 'zlecenie' (umowa zlecenia, direct — ZUS/tax obligations on us) and 'b2b'
 * (subcontractor invoices us). Pure + tested.
 */

export type ContractType = 'zlecenie' | 'b2b';
export type ContractStatus = 'active' | 'pending' | 'expired' | 'terminated';

export interface WorkerDocument {
    id: string;
    kind: 'id' | 'contract' | 'health' | 'other';
    name: string;
    uploadedAt: string;
}

export interface Contract {
    id: string;
    homieId: string;
    homieName: string;
    type: ContractType;
    /** Stored intent — dates still drive the effective status via contractStatus(). */
    status: ContractStatus;
    startDate: string; // YYYY-MM-DD
    endDate?: string; // omitted = indefinite
    contractorId?: string; // for b2b
    ratePct?: number; // payout share (0–1)
    documents: WorkerDocument[];
}

const day = (iso: string) => iso.slice(0, 10);

/** Effective status from the dates (respecting an explicit termination). */
export function contractStatus(c: Contract, refIso: string): ContractStatus {
    if (c.status === 'terminated') return 'terminated';
    const ref = day(refIso);
    if (day(c.startDate) > ref) return 'pending';
    if (c.endDate && day(c.endDate) < ref) return 'expired';
    return 'active';
}

export const isContractValid = (c: Contract, refIso: string): boolean => contractStatus(c, refIso) === 'active';

const daysBetween = (aIso: string, bIso: string) => Math.floor((new Date(`${day(bIso)}T00:00:00Z`).getTime() - new Date(`${day(aIso)}T00:00:00Z`).getTime()) / 86_400_000);

/** Active contracts whose fixed end date falls within the next `days`. */
export function expiringSoon(contracts: Contract[], refIso: string, days = 30): Contract[] {
    return contracts.filter(c => {
        if (contractStatus(c, refIso) !== 'active' || !c.endDate) return false;
        const d = daysBetween(refIso, c.endDate);
        return d >= 0 && d <= days;
    });
}

export function contractCounts(contracts: Contract[], refIso: string): Record<ContractStatus, number> {
    const counts: Record<ContractStatus, number> = { active: 0, pending: 0, expired: 0, terminated: 0 };
    for (const c of contracts) counts[contractStatus(c, refIso)] += 1;
    return counts;
}

/** Whether a worker of this contract type triggers ZUS/tax handling on our side. */
export const hasPayrollObligations = (type: ContractType): boolean => type === 'zlecenie';
