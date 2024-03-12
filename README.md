# ezccip.js
Turnkey CCIP-Read Handler for ENS

`npm i @resolverworks/ezccip`
* see [**types**](./dist/index.d.ts) / uses [ethers](https://github.com/ethers-io/ethers.js/)
* implements [TheOffchainResolver.sol](https://github.com/resolverworks/TheOffchainResolver.sol) protocol
* used by [TheOffchainGateway.js](https://github.com/resolverworks/TheOffchainGateway.js)
* works with [enson.js](https://github.com/resolverworks/enson.js)
* supports *Multicall-over-CCIP-Read*
    * `resolve(multicall(...))`
    * `multicall(resolve(...))`
    * `multicall(resolve(multicall(...)), ...)`
* use [`serve()`](./src/serve.js) to quickly launch a server

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
    * The demo server will print:
        > Signer: `0xd00d726b2aD6C81E894DC6B87BE6Ce9c5572D2cd`\
        > Listening on `8016` {\
        > ` ''`: `0x828ec5bDe537B8673AF98D77bCB275ae1CA26D1f` &larr; Mainnet\
        > `'s'`: `0x9Ec7f2ce83fcDF589487303fA9984942EF80Cb39` &larr; Sepolia,\
        > `'g'`: `0x9b87849Aa21889343b6fB1E146f9F734ecFA9982` &larr; Goerli\
        > }
    * Those `keys` correspond to the [TOR deployment](https://github.com/resolverworks/TheOffchainResolver.sol) on each chain.
    * The above configuration implies following `CONTEXT`:
        * Mainnet: `0xd00d726b2aD6C81E894DC6B87BE6Ce9c5572D2cd http://localhost:8016/`
        * Sepolia: `0xd00d726b2aD6C81E894DC6B87BE6Ce9c5572D2cd http://localhost:8016/s` &larr; `/key`
1. set [`CONTEXT`](https://github.com/resolverworks/TheOffchainResolver.sol#context-format)

## Examples

* **DNS**: [`ezccip.raffy.xyz`](https://adraffy.github.io/ens-normalize.js/test/resolver.html#ezccip.raffy.xyz)
    * Context: `0xd00d726b2aD6C81E894DC6B87BE6Ce9c5572D2cd https://raffy.xyz/ezccip/`
* **ENS**: [`ezccip.eth`](https://adraffy.github.io/ens-normalize.js/test/resolver.html?sepolia#ezccip.eth)
    * Context: `0xd00d726b2aD6C81E894DC6B87BE6Ce9c5572D2cd https://raffy.xyz/ezccip/s`
