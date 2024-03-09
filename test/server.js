import {createServer} from 'node:http';
import {ethers} from 'ethers';
import {EZCCIP} from '../src/handler.js';
import { error_with } from '../src/utils.js';

const PORT = 8016;

// note: this was picked at random
const signingKey = new ethers.SigningKey('0xbd1e630bd00f12f0810083ea3bd2be936ead3b2fa84d1bd6690c77da043e9e02');
// signer: 0xd00d726b2aD6C81E894DC6B87BE6Ce9c5572D2cd

const ENDPOINTS = {
	 '': '0x828ec5bDe537B8673AF98D77bCB275ae1CA26D1f',
	's': '0x9Ec7f2ce83fcDF589487303fA9984942EF80Cb39',
	'g': '0x9b87849Aa21889343b6fB1E146f9F734ecFA9982',
};

const ezccip = new EZCCIP();
ezccip.enableENSIP10(async (name, {sender, ip}) => {
	return {
		text(key) {
			switch (key) {
				case 'name': return `ezccip Demo for ${name}`;
				case 'notice': return new Date().toLocaleString();
				case 'description': return `Connection from ${ip}`;
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
});

createServer(async (req, reply) => {
	let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
	try {
		reply.setHeader('access-control-allow-origin', '*');
		let url = new URL(req.url, 'http://a');
		switch (req.method) {
			case 'GET': return reply.end('ezccip says hi');
			case 'OPTIONS': return reply.setHeader('access-control-allow-headers', '*').end();
			case 'POST': {
				// https://github.com/resolverworks/TheOffchainResolver.sol
				let resolver = ENDPOINTS[url.pathname.slice(1)];
				if (!resolver) throw error_with('resolver not found', {status: 404});
				let v = [];
				for await (let x of req) v.push(x);
				let {sender, data: calldata} = JSON.parse(Buffer.concat(v));
				let {data, history} = await ezccip.handleRead(sender, calldata, {signingKey, resolver, ip});
				log(ip, history.toString());
				return write_json(reply, {data});
			}
			default: throw error_with('unsupported http method', {status: 405});
		}
	} catch (err) {
		let status = 500;
		let message = 'internal error';
		if (Number.isInteger(err.status)) {
			({status, message} = err);
		}
		reply.statusCode = status;
		write_json(reply, {message});
		log(ip, req.method, req.url, status, err);
	}
}).listen(PORT).once('listening', () => {
	console.log(`Signer: ${ethers.computeAddress(signingKey)}`);
	console.log(`Listening on ${PORT}`, ENDPOINTS);
});

function log(...a) {
	let date = new Date();
	let time = date.toLocaleTimeString(undefined, {hour12: false});
	date = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	console.log(date, time, ...a);
}

function write_json(reply, json) {
	let buf = Buffer.from(JSON.stringify(json));
	reply.setHeader('content-length', buf.length);
	reply.setHeader('content-type', 'application/json');
	reply.end(buf);
}
