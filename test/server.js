import {createServer} from 'node:http';
import {ethers} from 'ethers';
import {handleCCIPRead, RESTError} from '../src/index.js';

const PORT = 8016;
const ENDPOINT = '/';

// note: this was picked at random
const signingKey = new ethers.SigningKey('0xbd1e630bd00f12f0810083ea3bd2be936ead3b2fa84d1bd6690c77da043e9e02');

createServer(async (req, reply) => {
	try {
		req._ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
		reply.setHeader('access-control-allow-origin', '*');
		let url = new URL(req.url, 'http://a');
		if (url.pathname !== ENDPOINT) throw new RESTError(404, 'file not found');
		switch (req.method) {
			case 'GET': return reply.end('ezccip says hi');
			case 'OPTIONS': return reply.setHeader('access-control-allow-headers', '*').end();
			case 'POST': {
				let v = [];
				for await (const x of req) v.push(x);
				let {sender, data: request} = JSON.parse(Buffer.concat(v));
				let {data, history} = await handleCCIPRead({sender, request, 
					signingKey,
					// mainnet deployment of TheOffchainResolver.sol
					// https://github.com/resolverworks/TheOffchainResolver.sol
					resolver: '0xa4407E257Aa158C737292ac95317a29b4C90729D', 
					getRecord({name, sender, /*labels*/ }) {
						return {
							text(key) {
								switch (key) {
									case 'name': return `ezccip Demo for ${name}`;
									case 'notice': return new Date().toLocaleString();
									case 'description': return `Connection from ${req._ip}`;
									case 'avatar': return 'https://raffy.antistupid.com/ens.jpg';
									case 'location': return sender;
								}
							},
							addr(type) {
								switch (type) {
									case 60: return '0x51050ec063d393217b436747617ad1c2285aeeee';
									case 3: return '0x76a9149eb02ebe2f323494320f9b1153f07a2e0eff528588ac'; // encode $doge address
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
					}
				});
				log(req, history.toString());
				return write_json(reply, {data});
			}
			default: throw new RESTError(400, 'unsupported http method');
		}
	} catch (err) {
		let {status = 500, message = 'internal error'} = err;
		reply.statusCode = status;
		write_json(reply, {message});
		log(req, err);
	}
}).listen(PORT).on('listening', () => {
	console.log('Ready!');
	console.log(`Signer: ${ethers.computeAddress(signingKey)}`);
});

function log(req, ...a) {
	let date = new Date();
	let time = date.toLocaleTimeString(undefined, {hour12: false});
	date = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	console.log(date, time, req._ip, req.method, req.url, ...a);
}

function write_json(reply, json) {
	let buf = Buffer.from(JSON.stringify(json));
	reply.setHeader('content-length', buf.length);
	reply.setHeader('content-type', 'application/json');
	reply.end(buf);
}
