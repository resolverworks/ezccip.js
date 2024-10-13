import {ethers} from 'ethers';
import {EZCCIP, processENSIP10} from '../src/ezccip.js'; 
import {serve} from '../src/serve.js'; 
import {test, after} from 'node:test';
import assert from 'node:assert/strict';

const record = {
	text() { return 'chonk'; },
	addr() { return '0x1234'; }
};

const ezccip = new EZCCIP();
ezccip.enableENSIP10(() => record);

const abi = ethers.AbiCoder.defaultAbiCoder();

const iface = new ethers.Interface([
	'function text(bytes32, string) returns (string)',
	'function addr(bytes32, uint256) returns (bytes)',
	'function resolve(bytes, bytes) returns (bytes)',
]);

let text_call = iface.encodeFunctionData('text', [ethers.ZeroHash, 'name']);
let addr_call = iface.encodeFunctionData('addr', [ethers.ZeroHash, 0]);

function wrap(x) {
	return iface.encodeFunctionData('resolve', [ethers.dnsEncode('chonk.eth'), x]);
}

// verify calldata dispatch through record
test('processENSIP10', async T => {
	await T.test('text', async () => {
		assert.equal(iface.decodeFunctionResult('text', await processENSIP10(record, text_call))[0], record.text());
	});
	await T.test('addr', async () => {
		assert.equal(iface.decodeFunctionResult('addr', await processENSIP10(record, addr_call))[0], record.addr());
	});
});

// verify main entry point
test('handleRead', async T => {
	await T.test('text', async () => {
		let {data} = await ezccip.handleRead(ethers.ZeroAddress, wrap(text_call), {protocol: 'raw'});
		assert.equal(iface.decodeFunctionResult('text', data)[0], record.text());
	});
	await T.test('addr', async () => {
		let {data} = await ezccip.handleRead(ethers.ZeroAddress, wrap(addr_call), {protocol: 'raw'});
		assert.equal(iface.decodeFunctionResult('addr', data)[0], record.addr());
	});
});

// reimplement all of the signing protocols
let protocols = {
	raw(_, response) { 
		return response;
	},
	ens(request, response, sender, signer) {
		let [answer, expires, sig] = abi.decode(['bytes', 'uint64', 'bytes'], response);
		let hash = ethers.solidityPackedKeccak256(
			['bytes', 'address', 'uint64', 'bytes32', 'bytes32'],
			['0x1900', sender, expires, ethers.keccak256(request), ethers.keccak256(answer)]
		);
		assert(signer, ethers.recoverAddress(hash, sig));
		assert(expires > Date.now()/1000 + 5, 'expired');
		return answer;
	},
	tor(request, response, sender, signer) {
		let [sig, expires, answer] = abi.decode(['bytes', 'uint64', 'bytes'], response);
		let hash = ethers.solidityPackedKeccak256(
			['address', 'uint64', 'bytes32', 'bytes32'],
			[sender, expires, ethers.keccak256(request), ethers.keccak256(answer)]
		);
		assert(signer, ethers.recoverAddress(hash, sig));
		assert(expires > Date.now()/1000 + 5, 'expired');
		return answer;
	}
};

// verify every protocol answers correctly
for (let [protocol, verify] of Object.entries(protocols)) {
	test(`protocol: ${protocol}`, async T => {
		let sender = ethers.ZeroAddress;
		let ccip = await serve(ezccip, {protocol});
		after(ccip.shutdown);
		async function get(call, url = ccip.endpoint) {
			let request = wrap(call);
			let res = await fetch(url, {method: 'POST', body: JSON.stringify({sender, data: request})});
			assert(res.status, 200);
			let {data} = await res.json();
			return verify(request, data, sender, ccip.signer);
		}
		await T.test('text', async () => {
			assert.equal(iface.decodeFunctionResult('text', await get(text_call))[0], record.text());
		});
		await T.test('addr', async () => {
			assert.equal(iface.decodeFunctionResult('addr', await get(addr_call))[0], record.addr());
		});
	});
}
