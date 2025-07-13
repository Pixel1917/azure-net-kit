import { browser } from '$app/environment';

export const onClickOutside = (node: HTMLElement, initiator?: HTMLElement) => {
	if (!browser) return { destroy: () => {} };

	const handleClick = (event: Event): void => {
		if (event.target instanceof HTMLElement) {
			if (
				event.target === node ||
				(node && event.composedPath().includes(node)) ||
				(initiator && event.target === initiator) ||
				(initiator && event.composedPath().includes(initiator))
			) {
				return;
			}
			node.dispatchEvent(new CustomEvent('outside', { detail: node }));
		}
	};

	document.addEventListener('click', handleClick, true);

	return {
		destroy(): void {
			document.removeEventListener('click', handleClick, true);
		}
	};
};
