# ezccip.js
Turnkey CCIP-Read Handler for ENS and arbitrary functions.

`npm i @resolverworks/ezccip`
* see [**types**](./dist/index.d.ts) / uses [ethers@6](https://github.com/ethers-io/ethers.js/)
* works with any server infrastructure
* implements multiple protocols:
	* `"tor"` &mdash; [resolverworks/**TheOffchainResolver.sol**](https://github.com/resolverworks/TheOffchainResolver.sol)
	* `"ens"` &mdash; [ensdomains/**offchain-resolver**](https://github.com/ensdomains/offchain-resolver/)
	* `"raw"` &mdash; raw response (EVM Gateway, testing, etc.) 
* used by [resolverworks/**TheOffchainGateway.js**](https://github.com/resolverworks/TheOffchainGateway.js)
* [resolverworks/**enson.js**](https://github.com/resolverworks/enson.js) **Record**-type directly compatible with `enableENSIP10()`
* supports *Multicall-over-CCIP-Read*
    * `resolve(multicall(...))`
    * `multicall(resolve(...))`
    * `multicall(resolve(multicall(...)), ...)`
* use [`serve()`](./src/serve.js) to quickly launch a server

## Usage

Create an instance and register some handlers.

```js
import {EZCCIP} from '@resolverworks/ezccip';

let ezccip = new EZCCIP();

// implement an arbitrary function
ezccip.register('add(uint256, uint256) returns (uint256)', ([a, b]) => [a + b]);

// implement a wildcard ENSIP-10 resolver
// which handles resolve() automatically
ezccip.enableENSIP10(async (name, context) => {
    return {
        async text(key) {
            switch (key) {
                case 'name': return 'Raffy';
                case 'avatar': return 'https://raffy.antistupid.com/ens.jpg';
            }
        },
    };
});

// more complicated example
let abi = new ethers.Interface([
	'function f(bytes32 x) return (string)',
	'function g(uint256 a, uint256 b) return (uint256)',
]);
ezccip.register(abi, { // register multiple functions at once using existing ABI
	async ['f()']([x], context, history) { // match function by signature
		history.show = [context.sender]; // replace arguments of f(...) in logger 
		history.name = 'Chonk'; // rename f() to Chonk() in logger
		return [context.calldata]; // return call data as hex
	},
	async ['0xe2179b8e']([a, b], context) {  // match by selector
		context.protocol = "tor"; // override signing protocol
		return ethers.toBeHex(1337n, 32); // return raw encoded result
	}
});
```
When your server has a request for CCIP-Read, use EZCCIP to produce a response.
```js
let {sender, data: calldata} = JSON.parse(req.body);
let {data} = await ezccip.handleRead(sender, calldata, {
    protocol: 'tor', // default, tor requires signingKey + resolver
    signingKey, // your private key
    resolver, // address of the TOR
    // most other values are considered "context"
    // which is passed to each handler
    // number: 1,
	// string: "abc",
});
reply.json({data});
```

## Demo

1. `npm run start` &mdash; starts a CCIP-Read server for [**TOR**](https://github.com/resolverworks/TheOffchainResolver.sol#context-format) protocol 
1. `setText("ccip.context", "0xd00d726b2aD6C81E894DC6B87BE6Ce9c5572D2cd http://localhost:8016")`

#### Note:

* `serve()` will bind requests to the `sender` if the protocol needs a target.  
* Provide a `resolvers` mapping to pair endpoint suffixes to specific contract deployments.
	* The [demo](./test/demo.js#L39) uses `s` to correspond to the [Sepolia deployment](https://sepolia.etherscan.io/address/0x9Ec7f2ce83fcDF589487303fA9984942EF80Cb39), which makes requests to the modified endpoint `http://localhost:8016/s` target that contract, regardless of sender. 
* An `endpoint` &harr; `contract` pairing is **required** to support wrapped/recursive CCIP calls!

## Examples

* **DNS**: [`ezccip.raffy.xyz`](https://adraffy.github.io/ens-normalize.js/test/resolver.html#ezccip.raffy.xyz)
    * Context: `0xd00d726b2aD6C81E894DC6B87BE6Ce9c5572D2cd https://raffy.xyz/ezccip/`
* **ENS**: [`ezccip.eth`](https://adraffy.github.io/ens-normalize.js/test/resolver.html?sepolia#ezccip.eth)
    * Context: `0xd00d726b2aD6C81E894DC6B87BE6Ce9c5572D2cd https://raffy.xyz/ezccip/s`
