import {labels_from_dns_encoded, error_with, asciiize} from './utils.js';

// direct imports to reduce serverless load
import {AbiCoder, Interface, FunctionFragment} from 'ethers/abi';
import {isBytesLike, getBytes,  isHexString, hexlify} from 'ethers/utils';
import {solidityPackedKeccak256} from 'ethers/hash';
import {keccak256} from 'ethers/crypto';
import {getAddress} from 'ethers/address';

export class History {
	constructor(level) {
		this.level = level; // integer, counts down
		this.children = [];
	}
	enter() {
		let {level, children: v} = this;
		if (!level) throw new Error('recursion limit');
		let child = new History(level-1);
		v.push(child);
		return child;
	}
	head() {
		let head = this;
		while (head.next) head = head.next;
		return head;
	}
	then() {
		return this.next = new History(this.level);
	}
	toString() {
		let {data, name, show, error, children: v, next} = this;
		let desc = name || `<${data ? data.slice(0, 10) : 'null'}>`;
		desc += '(';
		if (show) {
			if (typeof show === 'function') show = show(); // delayed output
			if (!Array.isArray(show)) show = [show]; // simple output
			if (show.length) { // render as args
				desc += show.map(x => typeof x === 'string' ? asciiize(x) : x).join(',');
			}
		}
		desc += ')';
		if (v.length) desc += `^${v.length} [${v.join(' ')}]`;
		if (error) desc += `<${error}>`;
		if (next) desc += `.${next}`;
		return desc;
	}
}

const ABI_CODER = AbiCoder.defaultAbiCoder();
const MULTICALL = 'multicall';
export const RESOLVE_ABI = new Interface([
	'function name(bytes32 node) external view returns (string)',
	'function addr(bytes32 node) external view returns (address)',
	'function addr(bytes32 node, uint256 type) external view returns (bytes)',
	'function text(bytes32 node, string key) external view returns (string)',
	'function contenthash(bytes32 node) external view returns (bytes)',
	'function pubkey(bytes32 node) external view returns (uint256 x, uint256 y)',
	'function ABI(bytes32 node, uint256 types) external view returns (uint256 type, bytes memory data)',
	'function multicall(bytes[] calls) external view returns (bytes[])',
]);
RESOLVE_ABI.forEachFunction(x => x.__name = x.format());

export class EZCCIP {
	constructor() {
		this.impls = new Map();
		// multicall is always enabled
		// you can disable it with {recursionLimit: 0}
		this.register('multicall(bytes[]) external view returns (bytes[])', async ([calls], context, history) => {
			history.show = false;
			return [await Promise.all(calls.map(x => this.handleCall(x, context, history.enter()).catch(encode_error)))];
		});
	}
	enableENSIP10(get, {multicall = true} = {}) {
		// https://docs.ens.domains/ensip/10
		this.register('resolve(bytes, bytes) external view returns (bytes)', async([dnsname, data], context, history) => {
			let labels = labels_from_dns_encoded(getBytes(dnsname));
			let name = labels.join('.');
			// note: this doesn't normalize
			// incoming name should be normalized
			// your database should be normalized
			history.show = [name];
			let record = await get(name, context, history);
			if (record) history.record = record;
			return processENSIP10(record, data, multicall, history.then());
			// returns raw since: abi.decode(abi.encode(x)) == x
		});
	}
	findHandler(key) {
		if (/^0x[0-9a-f]{8}$/.test(key)) {
			return this.impls.get(key.toLowerCase());
		} else if (x instanceof FunctionFragment) {
			return this.impls.get(x.selector);
		} else {
			for (let x of this.impls.values()) {
				if (x.frag.name === key || x.frag.format() === key) {
					return x;
				}
			}
		}
	}
	register(abi, impl) {
		if (typeof abi === 'string') {
			abi = abi.trim();
			if (!abi.startsWith('function') && !abi.includes('\n')) abi = `function ${abi}`;
			abi = [abi];
		}
		abi = Interface.from(abi);
		let frags = abi.fragments.filter(x => x instanceof FunctionFragment);
		if (impl instanceof Function) {
			if (frags.length != 1) throw error_with('expected 1 implementation', {abi, impl, names: frags.map(x => x.format())});
			let frag = frags[0];
			impl = {[frag.name]: impl};
		}
		return Object.entries(impl).map(([key, fn]) => {
			let frag = frags.find(x => x.name === key || x.format() === key || x.selector === key);
			if (!frag) {
				throw error_with(`expected interface function: ${key}`, {abi, impl, key});
			}
			let handler = {abi, frag, fn: fn.bind(this)};
			this.impls.set(frag.selector, handler);
			return handler;
		});
	}
	// https://eips.ethereum.org/EIPS/eip-3668
	async handleRead(sender, calldata, {protocol = 'tor', signingKey, origin, recursionLimit = 2, ttlSec = 60, ...context}) {
		if (!isHexString(sender) || sender.length !== 42) throw error_with('expected sender address', {status: 400});
		if (!isHexString(calldata) || calldata.length < 10) throw error_with('expected calldata', {status: 400});
		const history = new History(recursionLimit);
		context.sender = getAddress(sender);
		context.calldata = calldata = calldata.toLowerCase();
		context.origin = origin ? getAddress(origin) : context.sender; // origin can be modified by the callback
		context.protocol = protocol; // protocol be modified by the callback
		context.history = history;
		const response = await this.handleCall(calldata, context, history);
		let data;
		const expires = Math.floor(Date.now() / 1000) + ttlSec;
		switch (context.protocol) {
			case 'raw': {
				data = response;
				break;
			}
			case 'ens': {
				// https://github.com/ensdomains/offchain-resolver/blob/099b7e9827899efcf064e71b7125f7b4fc2e342f/packages/gateway/src/server.ts#L95
				let hash = solidityPackedKeccak256(
					['bytes', 'address', 'uint64', 'bytes32', 'bytes32'],
					['0x1900', context.origin, expires, keccak256(calldata), keccak256(response)]
				);
				data = ABI_CODER.encode(
					['bytes', 'uint64', 'bytes'],
					[response, expires, signingKey.sign(hash).serialized]
				);
				break;
			}
			case 'tor': {
				// https://github.com/resolverworks/TheOffchainResolver.sol?tab=readme-ov-file#tor-protocol
				let hash = solidityPackedKeccak256(
					['address', 'uint64', 'bytes32', 'bytes32'],
					[context.origin, expires, keccak256(calldata), keccak256(response)]
				);
				data = ABI_CODER.encode(
					['bytes', 'uint64', 'bytes'],
					[signingKey.sign(hash).serialized, expires, response]
				);
				break;
			}
			default: throw error_with('unknown protocol', {protocol});
		}		
		return {data, history};
	}
	async handleCall(calldata, context, history) {
		try {
			history.calldata = calldata;
			let method = calldata.slice(0, 10);
			let impl = this.impls.get(method);
			if (!impl || (!history.level && impl.name === MULTICALL)) throw new Error(`unsupported ccip method: ${method}`);
			const {abi, frag, fn} = history.impl = impl;
			history.name = frag.name;
			let args = abi.decodeFunctionData(frag, calldata);
			history.args = history.show = args;
			let res = await fn(args, context, history);
			if (!res) {
				// falsy implies return ()
				res = '0x';
			} else if (Array.isArray(res)) {
				// an array implies we need to encode the arguments
				res = abi.encodeFunctionResult(frag, res);
			} else if (typeof res !== 'string') { 
				// otherwise, the result is considered already encoded
				// support returning Uint8Array
				res = hexlify(res);
			}
			return res;
		} catch (err) {
			history.error = err;
			throw err;
		}
	}
}

export async function processENSIP10(record, calldata, multicall = true, history) {	
	try {
		if (history) history.calldata = calldata;
		let method = calldata.slice(0, 10);
		let frag = RESOLVE_ABI.getFunction(method);
		if (!frag || (!multicall && frag.name === MULTICALL)) throw error_with(`unsupported resolve() method: ${method}`, {calldata});
		if (history) {
			history.name = frag.name;
		}
		let args = RESOLVE_ABI.decodeFunctionData(frag, calldata);
		if (history) {
			history.args = args;
			history.show = args.slice(1); // drop namehash
		}
		let res;
		switch (frag.__name) {
			case 'multicall(bytes[])': {
				if (history) history.show = false;
				// https://github.com/ensdomains/ens-contracts/blob/staging/contracts/resolvers/IMulticallable.sol
				res = [await Promise.all(args.calls.map(x => processENSIP10(record, x, true, history?.enter()).catch(encode_error)))];
				break;
			}
			case 'addr(bytes32)': {
				// https://eips.ethereum.org/EIPS/eip-137
				let value = await record?.addr?.(60n);
				res = ['0x' + (value ? hexlify(value).slice(2, 42) : '').padStart(40, '0')];
				break;
			}
			case 'addr(bytes32,uint256)': {
				// https://eips.ethereum.org/EIPS/eip-2304
				if (history) history.show = [addr_type_str(args.type)];
				let value = await record?.addr?.(args.type);
				res = [value || '0x'];
				break;
			}
			case 'text(bytes32,string)': {
				// https://eips.ethereum.org/EIPS/eip-634
				let value = await record?.text?.(args.key);
				res = [value || ''];
				break;
			}
			case 'contenthash(bytes32)': {
				// https://docs.ens.domains/ens-improvement-proposals/ensip-7-contenthash-field
				let value = await record?.contenthash?.();
				res = [value || '0x'];
				break;
			}
			case 'name(bytes32)': {
				// https://eips.ethereum.org/EIPS/eip-181
				let value = await record?.name?.();
				res = [value || ''];
				break;
			}
			case 'pubkey(bytes32)': {
				// https://github.com/ethereum/EIPs/pull/619
				let value = await record?.pubkey?.();
				if (isBytesLike(value)) return value; // support raw encoding
				res = value ? [value.x, value.y] : [0, 0];
				break;
			}
			case 'ABI(bytes32,uint256)': {
				// https://docs.ens.domains/ens-improvement-proposals/ensip-4-support-for-contract-abis
				let types = Number(args.types);
				if (history) history.show = [abi_types_str(types)];
				let value = await record?.ABI?.(types);
				if (isBytesLike(value)) return value; // support raw encoding
				res = value ? [value.type, value.data] : [0, '0x'];
				break;
			}
			// not implemented:
			// https://github.com/ensdomains/ens-contracts/blob/staging/contracts/resolvers/profiles/IInterfaceResolver.sol
			// https://github.com/ensdomains/ens-contracts/blob/staging/contracts/resolvers/profiles/IDNSRecordResolver.sol
			// https://github.com/ensdomains/ens-contracts/blob/staging/contracts/resolvers/profiles/IDNSZoneResolver.sol
			// https://github.com/ensdomains/ens-contracts/blob/staging/contracts/resolvers/profiles/IVersionableResolver.sol
		}
		return RESOLVE_ABI.encodeFunctionResult(frag, res);
	} catch (err) {
		if (history) history.error = err;
		throw err;
	}
}

// format exception as `error Error(string)`
function encode_error(err) {
	return '0x08c379a0' + ABI_CODER.encode(['string'], [err.message]).slice(2);
}

// shorter coin names
function addr_type_str(type) {
	const msb = 0x80000000n;
	return type >= msb ? `evm:${type-msb}` : type;
}

// visible abi types
function abi_types_str(types) {
	let v = [];
	if (types & 1) v.push('JSON');
	if (types & 2) v.push('zip(JSON)');
	if (types & 4) v.push('CBOR');
	if (types & 8) v.push('URI');
	return v.join('|');
}
