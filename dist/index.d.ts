import type {SigningKey, BytesLike, BigNumberish, Interface, Result} from 'ethers';

type HexString = string;

export interface Record {
	addr?(type: number) : Promise<BytesLike | undefined>;
	text?(key: string) : Promise<string | undefined>;
	contenthash?(): Promise<BytesLike | undefined>;
	pubkey?(): Promise<{x: BigNumberish, y: BigNumberish} | BytesLike | undefined>; 
	name?(): Promise<string | undefined>;
	ABI?(types: number): Promise<{type: number, data: BytesLike} | BytesLike | undefined>;
}

export type History = {
	level: number;
	next?: History;
	children: History[];
	name?: string;
	error?: any;
	show?: any[];
	enter(): History;
	then(): History;
}

type CallContextExtra = {[key: string]: any};
type CallContext = {
	sender: HexString;
	calldata: HexString;
	resolver: HexString;
	history: History;
} & CallContextExtra;
type CCIPReadFunction = (args: Result, context: CallContext, history: History) => Promise<HexString | any[]>; 
type ENSIP10Function = (name: string, context: CallContext) => Promise<Record | undefined>;
type EZCCIPConfig = {
	signingKey: SigningKey;
	resolver: HexString;
	ttlSec?: number;
	recursionLimit?: number;
} & CallContextExtra;

export class EZCCIP {
	enableENSIP10(get: ENSIP10Function, options?: {multicall?: boolean}): void;
	register(abi: string | string[] | Interface, impl: CCIPReadFunction | {[name: string]: CCIPReadFunction}): void;
	handleRead(sender: HexString, calldata: HexString, config: EZCCIPConfig): Promise<{data: HexString, history: History}>;
}
export function callRecord(record: Record | undefined, calldata: HexString, multicall?: boolean, history?: History): string;

export function serve(handler: ENSIP10Function | EZCCIP, options?: {
	log?: (...a: any) => any; // default console.log w/date, false to disable
	port?: number; // default random open
	signingKey?: SigningKey; // default random
	resolvers?: HexString | {[key: string]: HexString}; // default 0x0
	// remainder included in context
} & CallContextExtra): Promise<{
	http: { close(): void };
	port: number;
	endpoint: string;
	signer: HexString;
	context: string;
}>;

export function asciiize(s: string): string;
export function labels_from_dns_encoded(v: Uint8Array): string[];

export const RESOLVE_ABI: Interface;
