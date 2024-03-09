import {asciiize} from './utils.js';

export class History {
	constructor(level) {
		this.level = level; // integer, counts down
		this.children = [];
		this.calldata = null;
		this.frag = null;
		this.args = null;
		this.show = null;
	}
	enter() {
		let {level, children: v} = this;
		if (!level) throw new Error('recursion limit');
		let child = new History(level-1);
		v.push(child);
		return child;
	}
	toString() {
		let {data, frag, show, error, children: v} = this;
		let desc = frag ? frag.name : `<${data ? data.slice(0, 10) : 'null'}>`;
		desc += '(';
		if (show) desc += show.map(x => typeof x === 'string' ? asciiize(x) : x).join(',');
		desc += ')';
		if (v.length) desc += `^${v.length} [${v.join(' ')}]`;
		if (error)    desc += `<${error}>`;
		return desc;
	}
}
