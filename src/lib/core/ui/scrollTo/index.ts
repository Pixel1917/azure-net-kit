import { BROWSER } from '@azure-net/tools/environment';

export const scrollTo = (nodeOrName: string | Element, offset = 220) => {
	if (BROWSER) {
		setTimeout(() => {}, 1);
		let element: Element;
		if (typeof nodeOrName === 'string') {
			const node = document.querySelector(nodeOrName);
			if (node) {
				element = node;
			}
		} else {
			element = nodeOrName;
		}
		if (element!) {
			const obj_pos = element.getBoundingClientRect();
			window.scrollTo({
				top: obj_pos.top + scrollY - offset,
				behavior: 'smooth'
			});
		}
	}
};
