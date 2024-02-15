import { ethers } from 'ethers';

function is_hex(s) {
	return typeof s === 'string' && /^0x[0-9a-f]*$/i.test(s);
}

function is_address(s) {
	return typeof s === 'string' && s.length == 42 && is_hex(s);
}

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

function safe_str(s) {
	return Array.from(s, ch => {
		let cp = ch.codePointAt(0);
		return cp >= 0x20 && cp < 0x80 ? ch : `{${cp.toString(16).toUpperCase().padStart(2, '0')}}`;
	}).join('');
}

class History {
	constructor(level) {
		this.level = level;
		this.actions = [];
		this.children = [];
	}
	add(s) {
		this.actions.push(s);
	}
	next() {
		let {level} = this;
		if (!level) throw new Error('too deep');
		let child = new History(level-1);
		this.children.push(child);
		return child;
	}
	toString() {
		let {actions, error, children: v} = this;
		let desc = actions.join('.');
		if (error) {
			desc += `<${error}>`;
		} else if (v.length) {
			desc += `(${v.length})[${v.join(' ')}]`;
		}
		return desc;
	}
}

const ABI_CODER = ethers.AbiCoder.defaultAbiCoder();

const CCIP_ABI = cache_abi(new ethers.Interface([
	'function resolve(bytes name, bytes data) external view returns (bytes)',
	'function multicall(bytes[] calls) external view returns (bytes[])',
]));

const RESOLVER_ABI = cache_abi(new ethers.Interface([
	'function name(bytes32 node) external view returns (string)',
	'function addr(bytes32 node) external view returns (address)',
	'function addr(bytes32 node, uint256 type) external view returns (bytes)',
	'function text(bytes32 node, string key) external view returns (string)',
	'function contenthash(bytes32 node) external view returns (bytes)',
	'function pubkey(bytes32 node) external view returns (uint256 x, uint256 y)',
	'function ABI(bytes32 node, uint256 types) external view returns (uint256 type, bytes memory data)',
	'function multicall(bytes[] calls) external view returns (bytes[])',
]));

class RESTError extends Error {
	constructor(status, message, cause) {
		super(message, {cause});
		this.status = status;
		if (cause && !this.cause) this.cause = cause;
	}
}

// https://eips.ethereum.org/EIPS/eip-3668
async function handleCCIPRead({sender, request, getRecord, signingKey, resolver, maxDepth = 1, ttlSec = 60} = {}) {
	if (!is_address(sender)) throw new RESTError(400, 'expected sender address');
	if (!is_hex(request)) throw new RESTError(400, 'expected calldata');
	sender = sender.toLowerCase();
	request = request.toLowerCase();
	let history = new History(maxDepth);
	try {
		let response = await handle_ccip_call(sender, request, getRecord, history);
		let expires = Math.floor(Date.now() / 1000) + ttlSec;
		let hash = ethers.solidityPackedKeccak256(
			['address', 'uint64', 'bytes32', 'bytes32'],
			[resolver, expires, ethers.keccak256(request), ethers.keccak256(response)]
		);
		let data = ABI_CODER.encode(['bytes', 'uint64', 'bytes'], [signingKey.sign(hash).serialized, expires, response]);
		return {data, history};
	} catch (err) {
		throw new RESTError(500, 'invalid request', err);
	}
}


async function handle_ccip_call(sender, data, getRecord, history) {
	try {
		let method = data.slice(0, 10);
		let func = CCIP_ABI.getFunction(method);
		if (!func) throw new Error(`unsupported ccip method: ${method}`);
		let args = CCIP_ABI.decodeFunctionData(func, data);
		switch (func.__name) {
			case 'resolve(bytes,bytes)': {
				let labels = labels_from_dns_encoded(ethers.getBytes(args.name));
				let name = labels.join('.');
				history.add(`resolve(${safe_str(name)})`);
				let record = await getRecord({labels, name, sender});
				return await handle_resolve(record, args.data, history);
				// returns without additional encoding
			}
			case 'multicall(bytes)': {
				history.add(`multicall`);
				args = [await Promise.all(args.calls.map(x => handle_ccip_call(sender, x, getRecord, history.next()).catch(encode_error)))];
				break;
			}
		}
		return CCIP_ABI.encodeFunctionResult(func, args);
	} catch (err) {
		history.error = err;
		throw err;
	}
}

async function handle_resolve(record, calldata, history) {	
	try {
		let method = calldata.slice(0, 10);
		let func = RESOLVER_ABI.getFunction(method);
		if (!func) throw new Error(`unsupported resolve() method: ${method}`);
		let args = RESOLVER_ABI.decodeFunctionData(func, calldata);
		let res;
		switch (func.__name) {		
			case 'multicall(bytes[])': {
				// https://github.com/ensdomains/ens-contracts/blob/staging/contracts/resolvers/IMulticallable.sol
				history.add(`multicall`);
				res = [await Promise.all(args.calls.map(x => handle_resolve(record, x, history.next()).catch(encode_error)))];
				break;
			}
			case 'addr(bytes32)': {
				// https://eips.ethereum.org/EIPS/eip-137
				history.add(`addr()`);
				let value = await record?.addr?.(60);
				res = [value ? ethers.hexlify(value) : ethers.ZeroAddress];
				break;
			}
			case 'addr(bytes32,uint256)': {
				// https://eips.ethereum.org/EIPS/eip-2304
				let type = Number(args.type); // TODO: BigInt => number
				history.add(`addr(${coin_name(type)})`);
				let value = await record?.addr?.(type);
				res = [value || '0x'];
				break;
			}
			case 'text(bytes32,string)': {
				// https://eips.ethereum.org/EIPS/eip-634
				history.add(`text(${safe_str(args.key)})`);
				let value = await record?.text?.(args.key);
				res = [value || ''];
				break;
			}
			case 'contenthash(bytes32)': {
				// https://docs.ens.domains/ens-improvement-proposals/ensip-7-contenthash-field
				history.add('contenthash()');
				let value = await record?.contenthash?.();
				res = [value || '0x'];
				break;
			}
			case 'pubkey(bytes32)': {
				// https://github.com/ethereum/EIPs/pull/619
				history.add('pubkey()');
				let value = await record?.pubkey?.();
				res = value ? [value.x, value.y] : [0, 0];
				break;
			}
			case 'name(bytes32)': {
				// https://eips.ethereum.org/EIPS/eip-181
				history.add(`name()`);
				let value = await record?.name?.();
				res = [value || ''];
				break;
			}
			case 'ABI(bytes32,uint256)': {
				// https://docs.ens.domains/ens-improvement-proposals/ensip-4-support-for-contract-abis
				history.add(`ABI(${abi_types(args.types)})`); // TODO: ABI
				let value = await record?.ABI?.(args.types);
				res = value ? [value.type, value.data] : [0, '0x'];
				break;
			}
		}
		return RESOLVER_ABI.encodeFunctionResult(func, res);
	} catch (err) {
		history.error = err;
		throw err;
	}
}

// format exception as `error Error(string)`
function encode_error(err) {
	return '0x08c379a0' + ABI_CODER.encode(['string'], [err.message]).slice(2);
}

// precompute all of the function names
function cache_abi(abi) {
	abi.forEachFunction(x => x.__name = x.format());
	return abi;
}

// shorter coin names
function coin_name(type) {
	const msb = 0x80000000;
	return type >= msb ? `evm:${type-msb}` : type;
}

// visible abi types
function abi_types(types) {
	let v = [];
	for (let i = 0; types > 0; i++) {
		let b = 1n << BigInt(i);
		if (types & b) {
			v.push(i);
			types &= ~b;
		}
	}
	return v.map(x => {
		switch (x) {
			case 0: return 'JSON';
			case 1: return 'zip(JSON)';
			case 2: return 'CBOR';
			case 3: return 'URI';
			default: return i;
		}
	}).join('|');
}

export { RESTError, handleCCIPRead };
