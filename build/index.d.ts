import type {
	SigningKey,
	BytesLike,
	BigNumberish,
	Interface,
	Result,
	FunctionFragment,
} from "ethers";

type HexString = string;

interface Record {
	addr?(type: bigint): Promise<BytesLike | undefined>;
	text?(key: string): Promise<string | undefined>;
	contenthash?(): Promise<BytesLike | undefined>;
	pubkey?(): Promise<
		{ x: BigNumberish; y: BigNumberish } | BytesLike | undefined
	>;
	name?(): Promise<string | undefined>;
	ABI?(
		types: number
	): Promise<{ type: number; data: BytesLike } | BytesLike | undefined>;
}

type Show = any | any[];

type History = {
	level: number;
	next?: History;
	children: History[];
	name?: string;
	error?: any;
	show?: Show | (() => Show);
	enter(): History;
	then(): History;
};

type SigningProtocol = "tor" | "ens" | "raw";

type CallContextExtra = { [key: string]: any };

type CallContext = {
	sender: HexString;
	calldata: HexString;
	protocol: SigningProtocol;
	resolver: HexString;
	history: History;
} & CallContextExtra;

type CCIPReadFunction = (
	args: Result,
	context: CallContext,
	history: History
) => Promise<BytesLike | any[] | undefined>;

type CCIPReadHandler = {
	abi: Interface;
	frag: FunctionFragment;
	fn: CCIPReadFunction;
};
type ENSIP10Function = (
	name: string,
	context: CallContext
) => Promise<Record | undefined>;

type EZCCIPConfig = {
	protocol?: SigningProtocol;
	signingKey?: SigningKey | HexString;
	ttlSec?: number;
	recursionLimit?: number;
} & CallContextExtra;

export class EZCCIP {
	enableENSIP10(
		get: ENSIP10Function,
		options?: { multicall?: boolean }
	): void;
	register(
		abi: string | string[] | Interface,
		impl: CCIPReadFunction | { [name: string]: CCIPReadFunction }
	): CCIPReadHandler[];
	handleRead(
		sender: HexString,
		calldata: HexString,
		config: EZCCIPConfig & { resolver?: HexString }
	): Promise<{ data: HexString; history: History }>;
}

export function processENSIP10(
	record: Record | undefined,
	calldata: HexString,
	multicall?: boolean,
	history?: History
): HexString;

export function asciiize(s: string): string;
export function labels_from_dns_encoded(v: Uint8Array): string[];
export function error_with(
	message: string,
	options: Object,
	cause?: any
): Error;

export const RESOLVE_ABI: Interface;
