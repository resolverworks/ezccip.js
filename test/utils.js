import {asciiize, labels_from_dns_encoded, error_with} from '../src/utils.js';
import {ethers} from 'ethers';
import {test} from 'node:test';
import assert from 'node:assert/strict';

test('asciiize', async t => {
	await t.test('poop', () => assert.equal('{1F4A9}', asciiize('💩')));
});

test('labels_from_dns_encoded', async t => {
	for (let x of ['raffy.eth', 'a.b.c.d.e']) {
		await t.test(x, () => assert.equal(x, labels_from_dns_encoded(ethers.getBytes(ethers.dnsEncode(x, 255))).join('.')));
	}
});

test('with_error', async t => {
	await t.test('params', () => {
		let a = 1;
		try {
			throw error_with('message', {a});
		} catch (err) {
			assert.equal(err.a, a);
		}	
	});
	await t.test('cause', () => {
		let msg = 'inner';
		try {
			try {
				throw new Error(msg);
			} catch (err) {
				throw error_with('outer', null, err);
			}
		} catch (err) {
			assert.equal(err.cause.message, msg);
		}
	});
});
