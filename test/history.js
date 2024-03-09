import {test} from 'node:test';
import assert from 'node:assert/strict';
import {History} from '../src/History.js';

test('history', async t => {
	await t.test('0 w/enter^1', () => assert.throws(() => new History(0).enter()));
	await t.test('1 w/enter^2', () => assert.throws(() => new History(1).enter().enter()));
	await t.test('no frag', () => assert.equal(new History(1).toString(), '<null>()'));
	await t.test('frag', () => {
		let h = new History(1);
		h.frag = {name: 'f'};
		h.add(1);
		assert.equal(h.toString(), 'f(1)');
	});
	await t.test('error', () => {
		let h = new History(1);
		h.frag = {name: 'f'};
		h.error = 'wtf';
		assert.equal(h.toString(), 'f()<wtf>');
	});
});
