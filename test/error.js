import {RESTError} from '../src/index.js';

try {
	throw new Error('chonk');
} catch (err) {
	throw new RESTError(1, 'nice chonk', err);
}
