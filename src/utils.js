import {ethers} from 'ethers';

// true if even-length 0x-prefixed mixed-case hex string
export function is_hex(s) {
	return typeof s === 'string' && !(s.length&1) && /^0x[0-9a-f]*$/i.test(s);
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
