import type {SigningKey, BytesLike, BigNumberish} from 'ethers';

export type HexString = string;

export interface Record {
	addr?(type: number) : Promise<BytesLike | undefined>;
	text?(key: string) : Promise<string | undefined>;
	contenthash?(): Promise<BytesLike | undefined>;
	pubkey?(): Promise<{x: BigNumberish, y: BigNumberish} | undefined>; 
	name?(): Promise<string | undefined>;
	ABI?(types: number): Promise<{type: number, data: BytesLike} | undefined>;
}

export type Action = {readonly desc: string, [key: string]: any};
export type History = {
	readonly level: number;
	readonly actions: readonly Action[];
	readonly children: readonly History[];
	readonly error?: any;
	add(a: Action): void;
	enter(): History;
}

export class RESTError extends Error {
	status: number;
	cause?: any;
}

export function handleCCIPRead(config: {
	sender: HexString;
	request: HexString;
	getRecord(context: {name: string, labels: string[], sender: HexString}): Promise<Record | undefined>;
	signingKey: SigningKey;
	resolver: HexString;
	ttlSec?: number;
	recursionLimit?: number;
}): Promise<{
	data: HexString;
	history: History;
}>; 

export function is_hex(s?: string): boolean;
export function asciiize(s: string): string;
export function labels_from_dns_encoded(v: Uint8Array): string[];
