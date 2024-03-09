import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ethers} from 'ethers';
import {asciiize, is_phex, is_bytes_like, labels_from_dns_encoded, error_with} from '../src/utils.js';

test('is_phex', async t => {
	for (let x of ['0x', '0x00', '0x0000']) {
		await t.test(`"${x}" is hex`, () => assert.equal(true, is_phex(x)));
	}
	for (let x of ['', '0y', 'xy', '0x0']) {
		await t.test(`"${x}" is not hex`, () => assert.equal(false, is_phex(x)));
	}
});

test('is_bytes_like', async t => {
	let m = [
		{value: '0xBEEF',         like: true},
		{value: 'chonk',          like: false},
		{value: new Uint8Array(), like: true,  name: 'Uint8Array'},
		{value: [],               like: false, name: 'Array'},
	]
	for (let x of m) {
		await t.test(`"${x.name ?? x.value}" = ${x.like}`, () => assert.equal(x.like, is_bytes_like(x.value)));
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
