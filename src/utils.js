import {ethers} from 'ethers';

export function error_with(message, params, cause) {
	let error;
	if (cause) {
		error = new Error(message, {cause});
		if (!error.cause) error.cause = cause;
	} else {
		error = new Error(message);
	}
	return Object.assign(error, params);
}

// dns-encoded name to array of unicode labels
// inverse of ethers.dnsEncode()
export function labels_from_dns_encoded(v) {
	let labels = [];
	let pos = 0;
	while (true) {
		let n = v[pos++];
		if (!n) { // empty
			if (pos !== v.length) break; // must be last
			return labels;
		}
		if (v.length < pos+n) break; // overflow
		labels.push(ethers.toUtf8String(v.subarray(pos, pos += n)));
	}
	throw new Error('invalid DNS-encoded name');
}

// unicode string to log-safe ascii string with {XX} escapes
// " !"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`abcdefghijklmnopqrstuvwxyz{|}~"	
export function asciiize(s) {
	return Array.from(s, ch => {
		let cp = ch.codePointAt(0);
		return cp >= 32 && cp <= 126 ? ch : `{${cp.toString(16).toUpperCase().padStart(2, '0')}}`;
	}).join('');
}
