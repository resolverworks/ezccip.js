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

export interface History {
	level: number;
	actions: string[];
	children: History[];
	error?: any;
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
	maxDepth?: number;
}): Promise<{
	data: HexString;
	history: History;
}>; 
