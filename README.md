# ezccip.js
Turnkey CCIP-Read Handler for ENS

`npm i @resolverworks/ezccip`
* see [types](./dist/index.d.ts) / uses [ethers](https://github.com/ethers-io/ethers.js/)
* works with [**TheOffchainResolver.sol**](https://github.com/resolverworks/TheOffchainResolver.sol) and [**enson.js**](https://github.com/resolverworks/enson.js)
* used by [**TheOffchainGateway.js**](https://github.com/resolverworks/TheOffchainGateway.js)
* supports *Multicall-over-CCIP-Read*
    * `resolve(multicall(...))`
    * `multicall(resolve(...))`
    * `multicall(resolve(multicall(...)), ...)`

```js
import {EZCCIP} from '@resolverworks/ezccip';

let ezccip = new EZCCIP();

// implement a wildcard ENSIP-10 resolver
ezccip.enableENSIP10(async (name, context) => {
    return {
        text(key) {
            switch (key) {
                case 'name': return 'Raffy';
                case 'avatar': return 'https://raffy.antistupid.com/ens.jpg';
            }
        },
        addr(type) {
            switch (type) {
                case 60: return '0x51050ec063d393217b436747617ad1c2285aeeee';
            }
        }
    };
});

// implement an arbitrary function
ezccip.register('add(uint256, uint256) returns (uint256)', ([a, b]) => [a + b]);

// imagine: your HTTP server has a request for CCIP-Read from GET or POST
let {sender, data: calldata} = JSON.parse(req.body);
let {data, history} = await ezccip.handleRead(sender, calldata, {
    signingKey, // your private key
    resolver, // any TOR deployment
    // all other values are considered "context" passed to each handler
    thing: 1,
});
reply.json({data});
```

## Demo

[`server.js`](./test/server.js)
1. `npm run start`
1. set [`CONTEXT`](https://github.com/resolverworks/TheOffchainResolver.sol#context-format)

## Examples

* **DNS**: [`ezccip.raffy.xyz`](https://adraffy.github.io/ens-normalize.js/test/resolver.html#ezccip.raffy.xyz)
    * Context: `0xd00d726b2aD6C81E894DC6B87BE6Ce9c5572D2cd https://raffy.xyz/ezccip/`
* **ENS**: [`ezccip.eth`](https://adraffy.github.io/ens-normalize.js/test/resolver.html?sepolia#ezccip.eth)
    * Context: `0xd00d726b2aD6C81E894DC6B87BE6Ce9c5572D2cd https://raffy.xyz/ezccip/s`
