import { EZCCIP, ENSIP10Function, EZCCIPConfig, HexString } from "./index.mjs";
import { Server } from "node:http";

export function serve(
	handler: ENSIP10Function | EZCCIP,
	options?: {
		log?: boolean | ((...a: any) => any); // default console.log w/date, falsy to disable
		port?: number; // default random open
		resolvers?: { [tag: string]: HexString }; // default: uses sender
	} & EZCCIPConfig
): Promise<
	Readonly<{
		http: Server;
		port: number;
		endpoint: string;
		signer: HexString;
		context: string;
		shutdown: () => Promise<void>;
	}>
>;
