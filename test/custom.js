import {ethers} from 'ethers';
import {EZCCIP} from '../src/ezccip.js'; 
import {serve} from '../src/serve.js'; 
import {test, after} from 'node:test';
import assert from 'node:assert/strict';

test('findHandler', async () => {
	let ezccip = new EZCCIP();
	ezccip.register('f(bytes32 x) returns (string)', () => []);
	assert(ezccip.findHandler('f'));
	assert(ezccip.findHandler('f(bytes32)'));
	let abi = new ethers.Interface([
		'function g(uint256 a, uint256 b) view returns (uint256)',
	])
	ezccip.register(abi, () => []);
	assert(ezccip.findHandler('g'));
	assert(ezccip.findHandler(ethers.id('g(uint256,uint256)').slice(0, 10)));
});

test('serve w/custom function', async () => {
	let args = [69n, 420n];
	let fn = ([a, b]) => [a * 1000n + b];
	let abi = new ethers.Interface(['function f(uint256, uint256) returns (uint256)']);

	let ezccip = new EZCCIP();
	ezccip.register(abi, fn);
	let ccip = await serve(ezccip, {log: true});
	after(ccip.shutdown);
	
	let frag = abi.getFunction('f');
	let res = await fetch(ccip.endpoint, {
		method: 'POST',
		body: JSON.stringify({
			sender: ethers.ZeroAddress,
			data: abi.encodeFunctionData(frag, args)
		})
	});
	assert.equal(res.status, 200, 'http status');	
	let {data} = await res.json();
	console.log([data, res.status]);
	assert(data, 'expected data');
	
	let answer = abi.getAbiCoder().decode(['bytes', 'uint64', 'bytes'], data)[2]; // ignore signing
	let result = abi.decodeFunctionResult(frag, answer);
	
	assert.deepEqual(result.toArray(), fn(args));
});

test('return args', async T => {
	let ezccip = new EZCCIP();	
	let ccip = await serve(ezccip, {log: true});
	after(ccip.shutdown);
	
	let abi = new ethers.Interface(['function f(uint256) returns (uint256)']);
	let impls = Object.entries({
		Arguments:  ([x]) => [x],
		Hex:        ([x]) => ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [x]),
		Uint8Array: ([x]) => ethers.getBytes(ethers.toBeHex(x, 32))
	});

	const EXPECT = 1337n;
	let frag = abi.getFunction('f');
	for (let [style, fn] of impls) {
		await T.test(`encoding: ${style}`, async () => {
			ezccip.register(abi, fn);
			let res = await fetch(ccip.endpoint, {
				method: 'POST',
				body: JSON.stringify({
					sender: ethers.ZeroAddress,
					data: abi.encodeFunctionData(frag, [EXPECT])
				})
			});
			let {data} = await res.json();
			let answer = abi.getAbiCoder().decode(['bytes', 'uint64', 'bytes'], data)[2]; // ignore signing
			let result = abi.decodeFunctionResult(frag, answer);
			assert.deepEqual(result.toArray(), [EXPECT]);
		});
	}

});
