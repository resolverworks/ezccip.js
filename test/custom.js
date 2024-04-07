import {ethers} from 'ethers';
import {EZCCIP} from '../src/ezccip.js'; 
import {serve} from '../src/serve.js'; 
import {test, after} from 'node:test';
import assert from 'node:assert/strict';

test('serve w/custom function', async () => {
	let args = [69n, 420n];
	let fn = ([a, b]) => [a * 1000n + b];
	let abi = new ethers.Interface(['function f(uint256, uint256) returns (uint256)']);

	let ezccip = new EZCCIP();
	ezccip.register(abi, fn);
	let ccip = await serve(ezccip, {log: true});
	after(() => ccip.http.close());
	
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
