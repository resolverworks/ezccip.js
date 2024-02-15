import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ethers} from 'ethers';
import {asciiize, is_hex, labels_from_dns_encoded} from '../src/utils.js';

test('is_hex', async t => {
	for (let x of ['0x', '0x00', '0x0000']) {
		await t.test(`"${x}" is hex`, () => assert.equal(true, is_hex(x)));
	}
	for (let x of ['', '0y', 'xy', '0x0']) {
		await t.test(`"${x}" is not hex`, () => assert.equal(false, is_hex(x)));
	}
});

test('asciiize', async t => {
	await t.test('poop', () => assert.equal('{1F4A9}', asciiize('💩')));
});

test('labels_from_dns_encoded', async t => {
	for (let x of ['raffy.eth', 'a.b.c.d.e']) {
		await t.test(x, () => assert.equal(x, labels_from_dns_encoded(ethers.getBytes(ethers.dnsEncode(x, 255))).join('.')));
	}
});
