export type Member = {
    part: string;
    name: string;
    account: string;
};
declare const core: {
    fields: string[];
    required: string[];
    multiple: string[];
    otherAllowed: string[];
    defaults: Record<string, string[]>;
    blank(): Record<string, string>;
    parseImport(text: string): Record<string, string>[];
    output(bands: Record<string, string>[], options?: {
        admin: boolean;
    }): string;
    validateOptions(value: unknown): Record<string, string[]>;
    tagItems(value: string, key: string): string[];
    tagText(values: string[]): string;
    memberRows(value: string): Member[];
    memberText(members: Member[]): string;
    videoId(value: string): string;
};
export default core;
