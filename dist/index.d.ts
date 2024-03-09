import type {SigningKey, BytesLike, BigNumberish, Interface, FunctionFragment, Result} from 'ethers';

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
	level: number;
	next: History;
	children: History[];
	error?: any;
	calldata?: HexString;
	frag?: FunctionFragment;
	args?: any[];
	show?: any[];
	enter(): History;
	then(): History;
}

type CallContext = {
	sender: HexString;
	calldata: HexString;
	resolver: HexString;
	[key: string]: any;
}
type CCIPReadFunction = (args: Result, context: CallContext, history: History) => Promise<HexString | any[]>; 
type ENSIP10Function = (name: string, context: CallContext) => Promise<Record | UndefNull>;
type EZCCIPConfig = {
	signingKey: SigningKey;
	resolver: HexString;
	ttlSec?: number;
	recursionLimit?: number;
	[key: string]: any;
};

export class EZCCIP {
	enableENSIP10(get: ENSIP10Function, options?: {multicall?: boolean}): void;
	register(abi: string | string[] | Interface, impl: CCIPReadFunction | {[name: string]: CCIPReadFunction}): void;
	handleRead(sender: HexString, calldata: HexString, config: EZCCIPConfig): Promise<{data: HexString, history: History}>;
}

export function callRecord(record: Record | UndefNull, calldata: HexString, multicall?: boolean, history?: History): string;

export function is_phex(s?: string): boolean;
export function asciiize(s: string): string;
export function labels_from_dns_encoded(v: Uint8Array): string[];

export const RESOLVE_ABI: Interface;
