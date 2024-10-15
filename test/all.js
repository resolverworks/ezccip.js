// check exports
import {
	EZCCIP, 
	History,
	processENSIP10,
	RESOLVE_ABI,
	error_with,
	asciiize,
	labels_from_dns_encoded,
} from '../src/index.js';

import {
	serve
} from '../src/serve.js';

// tests
import './utils.js';
import './history.js';
import './custom.js';
import './protocols.js';
import './encoding.js';
import './origin.js';
import './shutdown.js';
