import type {SigningKey, BytesLike, BigNumberish, Interface} from 'ethers';

export type HexString = string;

export interface Record {
	addr?(type: number) : Promise<BytesLike | undefined>;
	text?(key: string) : Promise<string | undefined>;
	contenthash?(): Promise<BytesLike | undefined>;
	pubkey?(): Promise<{x: BigNumberish, y: BigNumberish} | BytesLike | undefined>; 
	name?(): Promise<string | undefined>;
	ABI?(types: number): Promise<{type: number, data: BytesLike} | BytesLike | undefined>;
}

export type History = {
	readonly level: number;
	readonly actions: readonly any[];
	readonly children: readonly History[];
	readonly error?: any;
	add(a: any): void;
	enter(): History;
}

export class EZCCIP {
	enableENSIP10(getRecord: (name: string, context: Object) => Promise<Record | undefined>, options: {multicall?: boolean}): void;
	register(abi: string | string[] | Interface, impl: Function | {[name: string]: Function}): void;
	handleRead(sender: HexString, calldata: HexString, config: {
		signingKey: SigningKey;
		resolver: HexString;
		ttlSec?: number;
		recursionLimit?: number;
	}): Promise<{
		data: HexString;
		history: History;
	}>;
}

export function callRecord(record: Record | undefined, calldata: HexString, multicall?: boolean, history?: History): string;

export function is_phex(s?: string): boolean;
export function asciiize(s: string): string;
export function labels_from_dns_encoded(v: Uint8Array): string[];

export const RESOLVE_ABI: Interface;
