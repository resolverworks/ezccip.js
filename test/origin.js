import {EZCCIP} from '../src/ezccip.js';
import {serve} from '../src/serve.js';
import {test, after} from 'node:test';
import assert from 'assert/strict';

test('origin', async T => {

	const SENDER = '0x0000000000000000000000000000000000000001';
	const ORIGIN = '0x0000000000000000000000000000000000000002';

	async function check(config, expect, path = '') {
		const ezccip = new EZCCIP();
		const [handler] = ezccip.register('getOrigin() returns (string)', (_, c) => [c.origin]);
		const ccip = await serve(ezccip, {
			protocol: 'raw',
			log: false,
			...config,
		});
		after(ccip.shutdown);
		const res = await fetch(ccip.endpoint + path, {method: 'POST', body: JSON.stringify({
			sender: SENDER, 
			data: handler.abi.encodeFunctionData('getOrigin', [])
		})});
		const json = await res.json();
		const [origin] = handler.abi.decodeFunctionResult('getOrigin', json.data);
		assert.equal(origin, expect);
	}

	await T.test('default', () => check({}, SENDER));
	await T.test('fallback', () => check({origin: ORIGIN}, ORIGIN));
	await T.test('old design', () => check({resolvers: {['*']: ORIGIN}}, ORIGIN));

	await T.test('/origin', () => check({}, ORIGIN, `/${ORIGIN}`));
	await T.test('/origin/', () => check({}, ORIGIN, `/${ORIGIN}/`));
	await T.test('/a/origin/b', () => check({}, ORIGIN, `/a/${ORIGIN}/b`));
	await T.test('/a/origin?', () => check({}, ORIGIN, `/a/${ORIGIN}/b`));
	
});
