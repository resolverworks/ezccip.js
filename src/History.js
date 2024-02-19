export class History {
	constructor(level) {
		this.level = level; // integer, counts down
		this.actions = [];
		this.children = [];
	}
	add(action) {
		let {desc} = action;
		if (typeof desc !== 'string') throw new Error('expected description');
		this.actions.push(action);
	}
	enter() {
		let {level} = this;
		if (!level) throw new Error('recursion limit');
		let child = new History(level-1);
		this.children.push(child);
		return child;
	}
	toString() {
		let {actions, error, children: v} = this;
		let desc = actions.map(x => x.desc).join('.');
		if (v.length) {
			desc += `(${v.length})[${v.join(' ')}]`;
		}
		if (error) {
			desc += `<${error}>`;
		}
		return desc;
	}
}
