import {createServer} from 'node:http';
import {error_with} from './utils.js';
import {ethers} from 'ethers';
import {EZCCIP} from './ezccip.js';

export function serve(ezccip, {port, resolvers, log = true, protocol = 'tor', signingKey, ...a} = {}) {
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
		signingKey = new ethers.SigningKey(ethers.randomBytes(32));
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
						let key = url.slice(1);
						let resolver = resolvers ? resolvers[key] : sender;
						if (!resolver) throw error_with('unknown resolver', {status: 404, key});
						let {data, history} = await ezccip.handleRead(sender, calldata, {protocol, signingKey, resolver, ip, ...a});
						log?.(ip, url, history.toString(), (data.length-2)>>1);
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
			let signer = ethers.computeAddress(signingKey);
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
