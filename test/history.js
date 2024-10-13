import {test} from 'node:test';
import assert from 'node:assert/strict';
import {History} from '../src/ezccip.js';

test('history', async T => {
	await T.test('0 w/enter^1', () => assert.throws(() => new History(0).enter()));
	await T.test('1 w/enter^2', () => assert.throws(() => new History(1).enter().enter()));
	await T.test('no name', () => assert.equal(new History(1).toString(), '<null>()'));
	await T.test('name', () => {
		let h = new History(1);
		h.name = 'f';
		h.show = [1];
		assert.equal(h.toString(), 'f(1)');
	});
	await T.test('name + error', () => {
		let h = new History(1);
		h.name = 'f';
		h.error = 'wtf';
		assert.equal(h.toString(), 'f()<wtf>');
	});
	await T.test('then()', () => {
		let h = new History(0);
		h.then();
		assert.equal(h.toString(), '<null>().<null>()')
	});
	await T.test('direct show', () => {
		let h = new History(0);
		h.name = 'f';
		h.show = 'a';
		assert.equal(h.toString(), 'f(a)');
	});
	await T.test('delayed show', () => {
		let h = new History(0);
		h.name = 'f';
		h.show = () => ['a', 'b'];
		assert.equal(h.toString(), 'f(a,b)');
	});
});
