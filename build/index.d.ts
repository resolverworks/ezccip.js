import type {
	SigningKey,
	BytesLike,
	BigNumberish,
	Interface,
	Result,
	FunctionFragment,
} from "ethers";

type HexString = string;

type AnySync<T> = T | Promise<T>;

interface Record {
	addr?(type: bigint): AnySync<BytesLike | undefined>;
	text?(key: string): AnySync<string | undefined>;
	contenthash?(): AnySync<BytesLike | undefined>;
	pubkey?(): AnySync<
		{ x: BigNumberish; y: BigNumberish } | BytesLike | undefined
	>;
	name?(): AnySync<string | undefined>;
	ABI?(
		types: number
	): AnySync<{ type: number; data: BytesLike } | BytesLike | undefined>;
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
	origin: HexString;
	sender: HexString;
	calldata: HexString;
	protocol: SigningProtocol;
	history: History;
} & CallContextExtra;

type CCIPReadFunction = (
	args: Result,
	context: CallContext,
	history: History
) => AnySync<BytesLike | any[] | undefined>;

type CCIPReadHandler = {
	abi: Interface;
	frag: FunctionFragment;
	fn: CCIPReadFunction;
};
type RecordFunction = (
	name: string,
	context: CallContext
) => AnySync<Record | undefined>;

type EZCCIPConfig = {
	origin?: HexString;
	protocol?: SigningProtocol;
	signingKey?: SigningKey | HexString;
	ttlSec?: number;
	recursionLimit?: number;
} & CallContextExtra;

export class EZCCIP {
	enableENSIP10(get: RecordFunction, options?: { multicall?: boolean }): void;
	register(
		abi: string | string[] | Interface,
		impl: CCIPReadFunction | { [name: string]: CCIPReadFunction }
	): CCIPReadHandler[];
	findHandler(key: string | FunctionFragment): CCIPReadHandler | undefined;
	handleRead(
		sender: HexString,
		calldata: HexString,
		config: EZCCIPConfig
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
