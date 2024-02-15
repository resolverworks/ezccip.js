import {test} from 'node:test';
import assert from 'node:assert/strict';
import {History} from '../src/History.js';

test('history', async t => {
	await t.test('0 w/enter^1', () => assert.throws(() => new History(0).enter()));
	await t.test('1 w/enter^2', () => assert.throws(() => new History(1).enter().enter()));
	await t.test('missing description', () => assert.throws(() => new History(1).add({})));
});

let h = new History(1);
h.add({desc: 'a'});
h.enter().add({desc: 'b'});
console.log(`History toString(): ${h}`);
