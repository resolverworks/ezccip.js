import {serve} from '../src/serve.js';
import assert from 'assert/strict';
import {test} from 'node:test';

test('multi shutdown', async () => {
	const {shutdown} = await serve(() => {});
	assert.equal(shutdown(), shutdown());
});

test('stacked shutdown', async () => {
	const {shutdown} = await serve(() => {});
	await shutdown();
	await shutdown();
});
