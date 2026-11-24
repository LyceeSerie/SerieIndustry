import type { editor as C } from './schema';
export type Band = Record<string, string>;
export type OwnershipEvent = {
    at: string;
    by: string;
    owner: string;
    previousOwners?: string[];
};
export type Draft = {
    band: Band;
    id?: string;
    revision?: number;
    status?: string;
    submissionId?: string;
    hash?: string;
    ownerUserIds?: string[];
    ownershipVersion?: number;
    ownershipAudit?: OwnershipEvent[];
    registrationSource?: string;
    ownershipType?: string;
    tags: Record<string, string[]>;
    extras: Record<string, string[]>;
    members: {
        part: string;
        name: string;
        account: string;
    }[];
    links: Record<string, {
        title: string;
        url: string;
    }>;
};
export type PortalUser = {
    id: string;
    username: string;
    displayName: string;
};
export type Me = {
    eventsEnabled?: boolean;
    users?: PortalUser[];
    role?: string;
    userId?: string;
    canManage?: boolean;
    csrf: string;
    records: ({
        id: string;
        revision: number;
        status: string;
        band: Band;
    } & Partial<Draft>)[];
    limits: Record<string, {
        bytes: number;
        width: number;
        height: number;
    }>;
    consentRequired?: boolean;
    termsVersion?: string;
};
export type PreviewWindow = Window & {
    VBD_PREVIEW_API?: (path: string, body?: unknown) => Promise<any>;
    VBD_PREVIEW_OUTPUT?: (core: typeof C, band: Band, options?: {
        admin: boolean;
    }) => Band;
};
export type PortalRequest = (path: string, body?: unknown) => Promise<any>;
export type Message = (text: string, isError?: boolean) => void;
