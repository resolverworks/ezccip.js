import {asciiize} from './utils.js';

export class History {
	constructor(level) {
		this.level = level; // integer, counts down
		this.args = [];
		this.children = [];
	}
	add(arg) {
		this.args.push(arg);
	}
	enter() {
		let {level, children: v} = this;
		if (!level) throw new Error('recursion limit');
		let child = new History(level-1);
		v.push(child);
		return child;
	}
	toString() {
		let {data, frag, args: a, error, children: v} = this;
		let desc = frag ? frag.name : `<${data ? data.slice(0, 10) : 'null'}>`;
		desc += '(';
		if (a.length) desc += a.map(x => typeof x === 'string' ? asciiize(x) : x).join(',');
		desc += ')';
		if (v.length) desc += `^${v.length} [${v.join(' ')}]`;
		if (error)    desc += `<${error}>`;
		return desc;
	}
}
