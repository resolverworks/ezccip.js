import {is_phex, is_bytes_like, labels_from_dns_encoded, error_with} from './utils.js';
import {History} from './History.js';
import {ethers} from 'ethers';

const ABI_CODER = ethers.AbiCoder.defaultAbiCoder();
const MULTICALL = 'multicall';
export const RESOLVE_ABI = new ethers.Interface([
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
		this.register('multicall(bytes[]) external view returns (bytes[])', async ([calls], context, history) => {
			return [await Promise.all(calls.map(x => this.handleCall(x, context, history.enter()).catch(encode_error)))];
		});
	}
	enableENSIP10(fn, {multicall = true} = {}) {
		// https://docs.ens.domains/ensip/10
		this.register('resolve(bytes, bytes) external view returns (bytes)', async([dnsname, data], context, history) => {
			let labels = labels_from_dns_encoded(ethers.getBytes(dnsname));
			let name = labels.join('.');
			// note: this doesn't normalize
			// incoming name should be normalized
			// your database should be normalized
			history.add(name);
			let record = history.record = await fn(name, context);
			return await callRecord(record, data, multicall, history);
			// returns without additional encoding 
			// since: abi.decode(abi.encode(x)) == x
		});
	}
	register(abi, impl) {
		if (typeof abi === 'string') {
			abi = abi.trim();
			if (!abi.startsWith('function') && !abi.includes('\n')) abi = `function ${abi}`;
			abi = [abi];
		}
		if (Array.isArray(abi)) {
			abi = new ethers.Interface(abi);
		}
		if (!(abi instanceof ethers.Interface)) {
			throw with_error('expected abi', {abi});
		}
		let frags = abi.fragments.filter(x => x instanceof ethers.FunctionFragment);
		if (impl instanceof Function) {
			if (frags.length != 1) throw error_with('expected 1 function', {abi, impl, fns: frags});
			let frag = frags[0];
			this.impls.set(frag.selector, {abi, frag, fn: impl.bind(this)});
		} else {
			for (let [name, fn] of Object.entries(impl)) {
				let frag = frags.find(x => x.name === name);
				if (!frag) {
					frag = frags.find(x => x.format() === name);
					if (!frag) throw error_with('unknown abi function', {abi, name});
				}
				this.impls.set(frag.selector, {abi, frag, fn: fn.bind(this)});
			}
		}
	}
	// https://eips.ethereum.org/EIPS/eip-3668
	async handleRead(sender, calldata, {signingKey, resolver, recursionLimit = 2, ttlSec = 60, ...context}) {
		if (!is_phex(sender) || sender.length !== 42) throw with_error('expected sender address', {status: 400});
		if (!is_phex(calldata) || calldata.length < 10) throw with_error('expected calldata', {status: 400});
		calldata = calldata.toLowerCase();
		context.sender = sender.toLowerCase();
		context.calldata = calldata;
		context.resolver = resolver;
		let history = context.history = new History(recursionLimit);
		let response = await this.handleCall(calldata, context, history);
		let expires = Math.floor(Date.now() / 1000) + ttlSec;
		let hash = ethers.solidityPackedKeccak256(
			['address', 'uint64', 'bytes32', 'bytes32'],
			[resolver, expires, ethers.keccak256(calldata), ethers.keccak256(response)]
		);
		let data = ABI_CODER.encode(
			['bytes', 'uint64', 'bytes'],
			[signingKey.sign(hash).serialized, expires, response]
		);
		return {data, history};
	}
	async handleCall(calldata, context, history) {
		try {
			history.calldata = calldata;
			let method = calldata.slice(0, 10);
			let impl = this.impls.get(method);
			if (!impl || (history.level < 0 && impl.name === MULTICALL)) throw new Error(`unsupported ccip method: ${method}`);
			const {abi, frag, fn} = impl;
			history.abi = abi;
			history.frag = frag;
			let res = await fn(abi.decodeFunctionData(frag, calldata), context, history);
			if (Array.isArray(res)) res = abi.encodeFunctionResult(frag, res);
			return res;
		} catch (err) {
			history.error = err;
			throw err;
		}
	}
}

export async function callRecord(record, calldata, multicall = true, history) {	
	try {
		if (history) history.calldata = calldata;
		let method = calldata.slice(0, 10);
		let frag = RESOLVE_ABI.getFunction(method);
		if (!frag || (!multicall && frag.name === MULTICALL)) throw error_with(`unsupported resolve() method: ${method}`, {calldata});
		if (history) {
			history.abi = RESOLVE_ABI;
			history.frag = frag;
		}
		let args = RESOLVE_ABI.decodeFunctionData(frag, calldata);
		let res;
		switch (frag.__name) {
			case 'multicall(bytes[])': {
				// https://github.com/ensdomains/ens-contracts/blob/staging/contracts/resolvers/IMulticallable.sol
				res = [await Promise.all(args.calls.map(x => callRecord(record, x, true, history?.enter()).catch(encode_error)))];
				break;
			}
			case 'addr(bytes32)': {
				// https://eips.ethereum.org/EIPS/eip-137
				let value = await record?.addr?.(60);
				res = [value ? ethers.hexlify(value) : ethers.ZeroAddress]; // ethers bug, doesn't support Uint8Array as address
				break;
			}
			case 'addr(bytes32,uint256)': {
				// https://eips.ethereum.org/EIPS/eip-2304
				let type = Number(args.type); // TODO: BigInt => number
				if (history) {
					history.add(addr_type_str(type));
					history.type = type;
				}
				let value = await record?.addr?.(type);
				res = [value || '0x'];
				break;
			}
			case 'text(bytes32,string)': {
				// https://eips.ethereum.org/EIPS/eip-634
				let {key} = args;
				if (history) {
					history.add(key);
					history.key = key;
				}
				let value = await record?.text?.(key);
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
				if (is_bytes_like(value)) return value; // support raw encoding
				res = value ? [value.x, value.y] : [0, 0];
				break;
			}
			case 'ABI(bytes32,uint256)': {
				// https://docs.ens.domains/ens-improvement-proposals/ensip-4-support-for-contract-abis
				let types = Number(args.types);
				if (history) {
					history.add(abi_types_str(types));
					history.types = types;
				}
				let value = await record?.ABI?.(types);
				if (is_bytes_like(value)) return value; // support raw encoding
				res = value ? [value.type, value.data] : [0, '0x'];
				break;
			}
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
	const msb = 0x80000000;
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