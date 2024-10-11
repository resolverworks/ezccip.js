import {createServer} from 'node:http';
import {EZCCIP, error_with} from './index.js';
import {id as keccakStr} from 'ethers/hash';
import {computeAddress} from 'ethers/transaction';
import {SigningKey} from 'ethers/crypto';

export function serve(ezccip, {port = 0, resolvers = {}, log = true, protocol = 'tor', signingKey, ...a} = {}) {
	if (ezccip instanceof Function) {
		let temp = new EZCCIP();
		temp.enableENSIP10(ezccip);
		ezccip = temp;
	}
	if (log === true) {
		log = (...a) => console.log(new Date(), ...a);
	} else if (!log) {
		log = undefined;
	}
	if (!signingKey) {
		signingKey = keccakStr('ezccip'); // 20240518: fixed instead of random key
	}
	if (!(signingKey instanceof SigningKey)) {
		signingKey = new SigningKey(signingKey);
	}
	return new Promise(ful => {
		let http = createServer(async (req, reply) => {
			let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
			let {method, url} = req;
			try {
				reply.setHeader('access-control-allow-origin', '*');
				switch (method) {
					case 'OPTIONS': return reply.setHeader('access-control-allow-headers', '*').end();
					case 'POST': {
						let v = [];
						for await (let x of req) v.push(x);
						let {sender, data: calldata} = JSON.parse(Buffer.concat(v));
						let resolverKey = url.slice(1);
						let resolver = resolvers[resolverKey] ?? resolvers['*'] ?? sender;
						if (!resolver) throw error_with('unknown resolver', {status: 404, resolverKey});
						let {data, history} = await ezccip.handleRead(sender, calldata, {
							protocol,
							signingKey,
							resolver,
							resolvers,
							resolverKey,
							ip,
							...a,
						});
						log?.(ip, url, history.toString());
						write_json(reply, {data});
						break;
					}
					default: throw error_with('unsupported http method', {status: 405, method});
				}
			} catch (err) {
				log?.(ip, method, url, err);
				let {status = 500, message} = err;
				reply.statusCode = status;
				write_json(reply, {message});
			}
		});
		http.listen(port, () => {
			port = http.address().port;
			let endpoint = `http://localhost:${port}`;
			let signer = computeAddress(signingKey);
			let context = `${signer} ${endpoint}`;
			log?.('Ready!', {protocol, context});
			ful({http, port, endpoint, signer, context});
		});
	});
}

function write_json(reply, json) {
	let buf = Buffer.from(JSON.stringify(json));
	reply.setHeader('content-length', buf.length);
	reply.setHeader('content-type', 'application/json');
	reply.end(buf);
}
