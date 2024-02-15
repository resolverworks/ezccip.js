export class History {
	constructor(level) {
		this.level = level;
		this.actions = [];
		this.children = [];
	}
	add(s) {
		this.actions.push(s);
	}
	next() {
		let {level} = this;
		if (!level) throw new Error('too deep');
		let child = new History(level-1);
		this.children.push(child);
		return child;
	}
	toString() {
		let {actions, error, children: v} = this;
		let desc = actions.join('.');
		if (error) {
			desc += `<${error}>`;
		} else if (v.length) {
			desc += `(${v.length})[${v.join(' ')}]`;
		}
		return desc;
	}
}
