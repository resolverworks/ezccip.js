# ezccip.js
Turnkey [EIP-3668: CCIP-Read](https://eips.ethereum.org/EIPS/eip-3668) Handler for ENS and arbitrary functions.

`npm i @resolverworks/ezccip` [&check;](https://www.npmjs.com/package/@resolverworks/ezccip)

* see [**types**](./dist/index.d.mts) / uses [ethers](https://github.com/ethers-io/ethers.js/)
* works with any server infrastructure
    * uses minimal imports for serverless
* implements multiple protocols:
    * `"tor"` &mdash; [resolverworks/**TheOffchainResolver.sol**](https://github.com/resolverworks/TheOffchainResolver.sol)
    * `"ens"` &mdash; [ensdomains/**offchain-resolver**](https://github.com/ensdomains/offchain-resolver/) and [ccip.tools](https://ccip.tools/)
    * `"raw"` &mdash; raw response (EVM Gateway, testing, etc.) 
* used by [resolverworks/**TheOffchainGateway.js**](https://github.com/resolverworks/TheOffchainGateway.js)
* `enableENSIP10()` drop-in support for [resolverworks/**enson.js**](https://github.com/resolverworks/enson.js) **Record**-type
* supports *Multicall-over-CCIP-Read*
    * `resolve(name, multicall([...]))`
    * `multicall([resolve(name, ...), ...])`
    * `multicall([resolve(name, multicall([...])), ...])`
* use [`serve()`](#serve) to quickly launch a server
* [**CCIP Postman**](https://resolverworks.github.io/ezccip.js/test/postman.html) ⭐️
    * directly debug any CCIP-Read server (no RPC)

## Demo

1. `npm run start` &mdash; starts a CCIP-Read server for [**TOR**](https://github.com/resolverworks/TheOffchainResolver.sol#context-format) protocol using [`serve()`](#serve)
1. `TOR.setText("ccip.context", "0xd00d726b2aD6C81E894DC6B87BE6Ce9c5572D2cd http://localhost:8016")`
1. or, use [Postman](https://resolverworks.github.io/ezccip.js/test/postman.html#endpoint=https%3A%2F%2Fraffy.xyz%2Fezccip%2F&proto=tor&name=raffy.eth&multi=inner&field=addr-&field=text-description) &mdash; change to `http://localhost:8016`

### Examples

* **DNS**: [`ezccip.raffy.xyz`](https://adraffy.github.io/ens-normalize.js/test/resolver.html#ezccip.raffy.xyz) (Mainnet)
    * Context: `0xd00d726b2aD6C81E894DC6B87BE6Ce9c5572D2cd https://raffy.xyz/ezccip/`
* **ENS**: [`ezccip.eth`](https://adraffy.github.io/ens-normalize.js/test/resolver.html?sepolia#ezccip.eth) (Sepolia)
    * Context: `0xd00d726b2aD6C81E894DC6B87BE6Ce9c5572D2cd https://raffy.xyz/ezccip/s`

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
        return [context.calldata]; // echo incoming calldata
    },
    async ['0xe2179b8e']([a, b], context) {  // match by selector
        context.protocol = "tor"; // override signing protocol
        return ethers.toBeHex(1337n, 32); // return raw encoded result
    }
});
```
When your server has a request for CCIP-Read, use EZCCIP to produce a response.
```js
let {sender, data: calldata} = JSON.parse(req.body); // ABI-encoded request in JSON from EIP-3668
let {data, history} = await ezccip.handleRead(sender, calldata, {
    protocol: 'tor', // default, tor requires signingKey + resolver
    signingKey, // your private key
});
reply.json({data}); // ABI-encoded response in JSON for EIP-3668
console.log(history.toString()); // description of response
```
* implement via `GET`, `POST`, or query directly
* `context` carries useful information about the incoming request
* `history` collects information as the response is generated

### serve()

Start a [simple server](./src/serve.js) for an EZCCIP instance or a function representing the `enableENSIP10()` handler.
```js
import {serve} from '@resolverworks/ezccip/serve';
let ccip = await serve(ezccip); // see types for more configuration
// ...
await ccip.shutdown();

// minimal example:
// return fixed text() for any name
await serve(() => { text: () => 'Raffy' });
```

#### Sender vs Origin

* ⚠️ `sender` may not be the originating contract 
	* see: [recursive CCIP-Read](https://eips.ethereum.org/EIPS/eip-3668#recursive-calls-in-ccip-aware-contracts)
* **Best Solution**: embed `origin` into the endpoint as a path component:
	1. `http://my.server/.../0xABCD/...` 
	1. `origin = 0xABCD`
* or, use `parseOrigin(path: string) => string` to extract `origin` from an arbitrary path
* or, supply a fallback `origin`
* if `origin` is not detected, `origin = sender`

### processENSIP10()

Apply ENSIP-10 `calldata` to a `Record`-object and generate the corresponding ABI-encoded response.  This is a free-function.
```js
let record = {
    text(key) { if (key == 'name') return 'raffy'; }
    addr(type) { if (type == 60) return '0x1234'; }
};
let calldata = '0x...'; // encodeFunctionData('text', ['name']);
let res = await processENSIP10(record, calldata); // encodeFunctionResult('text', ['raffy']);
```
