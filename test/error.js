import {RESTError} from '../src/handler.js';

try {
	throw new Error('chonk');
} catch (err) {
	throw new RESTError(1, 'nice chonk', err);
}
