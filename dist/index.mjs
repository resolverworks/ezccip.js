import { ethers } from 'ethers';

function error_with(message, params, cause) {
	let error;
	if (cause) {
		error = new Error(message, {cause});
		if (!error.cause) error.cause = cause;
	} else {
		error = new Error(message);
	}
	return Object.assign(error, params);
}

// true if even-length 0x-prefixed mixed-case hex string
function is_phex(s) {
	return typeof s === 'string' && !(s.length&1) && /^0x[0-9a-f]*$/i.test(s);
}
function is_bytes_like(x) {
	return x instanceof Uint8Array || is_phex(x);
}

// dns-encoded name to array of unicode labels
// inverse of ethers.dnsEncode()
function labels_from_dns_encoded(v) {
	let labels = [];
	let pos = 0;
	while (true) {
		let n = v[pos++];
		if (!n) { // empty
			if (pos !== v.length) break; // must be last
			return labels;
		}
		if (v.length < pos+n) break; // overflow
		labels.push(ethers.toUtf8String(v.subarray(pos, pos += n)));
	}
	throw new Error('invalid DNS-encoded name');
}

// unicode string to log-safe ascii string with {XX} escapes
// " !"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`abcdefghijklmnopqrstuvwxyz{|}~"	
function asciiize(s) {
	return Array.from(s, ch => {
		let cp = ch.codePointAt(0);
		return cp >= 32 && cp <= 126 ? ch : `{${cp.toString(16).toUpperCase().padStart(2, '0')}}`;
	}).join('');
}

class History {
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
	toString() {
		let {data, frag, show, error, children: v} = this;
		let desc = frag ? frag.name : `<${data ? data.slice(0, 10) : 'null'}>`;
		desc += '(';
		if (show) desc += show.map(x => typeof x === 'string' ? asciiize(x) : x).join(',');
		desc += ')';
		if (v.length) desc += `^${v.length} [${v.join(' ')}]`;
		if (error)    desc += `<${error}>`;
		return desc;
	}
}

const ABI_CODER = ethers.AbiCoder.defaultAbiCoder();
const MULTICALL = 'multicall';
const RESOLVE_ABI = new ethers.Interface([
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

class EZCCIP {
	constructor() {
		this.impls = new Map();
		this.register('multicall(bytes[]) external view returns (bytes[])', async ([calls], context, history) => {
			history.show = false;
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
			history.show = [name];
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
			let args = abi.decodeFunctionData(frag, calldata);
			history.args = history.show = args;
			let res = await fn(args, context, history);
			if (Array.isArray(res)) res = abi.encodeFunctionResult(frag, res);
			return res;
		} catch (err) {
			history.error = err;
			throw err;
		}
	}
}

async function callRecord(record, calldata, multicall = true, history) {	
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
		if (history) {
			history.args = args;
			history.show = args.slice(1);
		}
		let res;
		switch (frag.__name) {
			case 'multicall(bytes[])': {
				history.show = false;
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
					history.show = [addr_type_str(type)];
				}
				let value = await record?.addr?.(type);
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
				if (is_bytes_like(value)) return value; // support raw encoding
				res = value ? [value.x, value.y] : [0, 0];
				break;
			}
			case 'ABI(bytes32,uint256)': {
				// https://docs.ens.domains/ens-improvement-proposals/ensip-4-support-for-contract-abis
				let types = Number(args.types);
				if (history) {
					history.show = [abi_types_str(types)];
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

export { EZCCIP, History, RESOLVE_ABI, asciiize, callRecord, error_with, is_bytes_like, is_phex, labels_from_dns_encoded };
