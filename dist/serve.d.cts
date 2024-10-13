import { EZCCIP, RecordFunction, EZCCIPConfig, HexString } from "./index.cjs";
import { Server } from "node:http";

export function serve(
	handler: RecordFunction | EZCCIP,
	options?: {
		log?: boolean | ((...a: any) => any); // default console.log w/date, falsy to disable
		formatError?: (error: Error) => any;
		port?: number; // default random open
		parseOrigin?: (path: string) => HexString;
		// this also supplies: { url, ip }
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
