import {ethers} from 'ethers';

let abi = new ethers.Interface([
	'function example(uint256, uint256) returns (uint256)'
]);
let frag = abi.getFunction('example');

let {data} = await fetch('https://home.antistupid.com/ezccip/', {
	method: 'POST',
	body: JSON.stringify({
		sender: ethers.ZeroAddress,
		data: abi.encodeFunctionData(frag, [69, 420])
	})
}).then(r => r.json());

// ignore signing
let answer = abi.getAbiCoder().decode(['bytes', 'uint64', 'bytes'], data)[2];

let [res] = abi.decodeFunctionResult(frag, answer);

console.log(res);
