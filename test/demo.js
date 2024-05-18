import {EZCCIP, serve} from '../src/index.js';
import {readFileSync} from 'node:fs';

const DNSTORWithENSProtocol = '0x3CA097Edd180Ea2C2436BD30c021Ca20869087a0';

let {version} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));

let ezccip = new EZCCIP();
ezccip.register('example(uint256, uint256) returns (uint256)', ([a, b]) => [a * 1000n + b]);
ezccip.enableENSIP10(async (name, context) => {
	if (context.resolver === DNSTORWithENSProtocol) {
		context.protocol = 'ens'; // dynamic protocol change
	}
	return {
		text(key) {
			switch (key) {
				case 'name': return `ezccip Demo for ${name} (v${version})`;
				case 'notice': return new Date().toLocaleString();
				case 'description': return `Connection from ${context.ip}`;
				case 'avatar': return 'https://raffy.antistupid.com/ens.jpg';
				case 'location': return `Protocol(${context.protocol}) Sender(${context.sender})`;
			}
		},
		addr(type) {
			switch (Number(type)) {
				case 60: return '0x51050ec063d393217b436747617ad1c2285aeeee';
				case 3: return '0x76a9149eb02ebe2f323494320f9b1153f07a2e0eff528588ac'; // encoded $doge address
			}
		},
		pubkey() {
			return {x: 1, y: 2};
		},
		contenthash() { 
			return '0xe301017012201687de19f1516b9e560ab8655faa678e3a023ebff43494ac06a36581aafc957e'; // vitaliks blog
		},
		ABI(types) {
			return {type: 0, data: '0x'};
		}
	};
});

await serve(ezccip, {
	port: 8016,
	resolvers: {
	   // old TORs (during development)
	      '': '0x828ec5bDe537B8673AF98D77bCB275ae1CA26D1f', // Mainnet
	     's': '0x9Ec7f2ce83fcDF589487303fA9984942EF80Cb39', // Sepolia
	     'g': '0x9b87849Aa21889343b6fB1E146f9F734ecFA9982', // Goerli

	   // newest TOR
	    'e4': '0x7CE6Cf740075B5AF6b1681d67136B84431B43AbD', // Mainnet (v4)
	    's4': '0x3c187BAb6dC2C94790d4dA5308672e6F799DcEC3', // Sepolia (v4)
	   'ens': DNSTORWithENSProtocol,
	},
	signingKey: '0xbd1e630bd00f12f0810083ea3bd2be936ead3b2fa84d1bd6690c77da043e9e02',
});
