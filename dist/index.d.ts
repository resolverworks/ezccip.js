import type {SigningKey, BytesLike, BigNumberish, Interface} from 'ethers';

type HexString = string;
type UndefNull  = null | undefined; 

export interface Record {
	addr?(type: number) : Promise<BytesLike | UndefNull>;
	text?(key: string) : Promise<string | UndefNull>;
	contenthash?(): Promise<BytesLike | UndefNull>;
	pubkey?(): Promise<{x: BigNumberish, y: BigNumberish} | BytesLike | UndefNull>; 
	name?(): Promise<string | UndefNull>;
	ABI?(types: number): Promise<{type: number, data: BytesLike} | BytesLike | UndefNull>;
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
	enableENSIP10(getRecord: (name: string, context: Object) => Promise<Record | UndefNull>, options?: {multicall?: boolean}): void;
	register(abi: string | string[] | Interface, impl: Function | {[name: string]: Function}): void;
	handleRead(sender: HexString, calldata: HexString, config: {
		signingKey: SigningKey;
		resolver: HexString;
		ttlSec?: number;
		recursionLimit?: number;
		[key: string]: any;
	}): Promise<{
		data: HexString;
		history: History;
	}>;
}

export function callRecord(record: Record | UndefNull, calldata: HexString, multicall?: boolean, history?: History): string;

export function is_phex(s?: string): boolean;
export function asciiize(s: string): string;
export function labels_from_dns_encoded(v: Uint8Array): string[];

export const RESOLVE_ABI: Interface;
