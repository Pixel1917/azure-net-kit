export type TokenSettings = { pattern?: RegExp; escape?: boolean; transform?: (v: string) => string };
export type Tokens = Record<string, TokenSettings>;

export class Mask {
	static tokens: Tokens = {
		X: { pattern: /[0-9a-zA-Z]/ },
		S: { pattern: /[a-zA-Z]/ },
		A: { pattern: /[a-zA-Z]/, transform: (v: string) => v.toLocaleUpperCase() },
		a: { pattern: /[a-zA-Z]/, transform: (v: string) => v.toLocaleLowerCase() },
		'#': { pattern: /\d/ },
		'!': { escape: true }
	};

	static dynamicMask(maskIt: typeof Mask.maskIt, masks: string[], tokens: Tokens) {
		masks = masks.sort((a, b) => a.length - b.length);
		return function (value: string, masked = true) {
			let i = 0;
			while (i < masks.length) {
				const currentMask = masks[i];
				i++;
				const nextMask = masks[i];
				if (!(nextMask && maskIt(value, nextMask, true, tokens).length > currentMask.length)) {
					return maskIt(value, currentMask, masked, tokens);
				}
			}
			return '';
		};
	}

	static maskIt(value: string, mask: string | undefined = undefined, masked = true, tokens: Tokens) {
		value = value || '';
		mask = mask || '';
		let iMask = 0;
		let iValue = 0;
		let output = '';
		while (iMask < mask.length && iValue < value.length) {
			let cMask = mask[iMask];
			const masker = tokens[cMask as keyof Tokens];
			const cValue = value[iValue];
			if (masker && !masker.escape) {
				if (masker.pattern?.test(cValue)) {
					output += masker.transform ? masker.transform(cValue) : cValue;
					iMask++;
				}
				iValue++;
			} else {
				if (masker && masker.escape) {
					iMask++;
					cMask = mask[iMask];
				}
				if (masked) output += cMask;
				if (cValue === cMask) iValue++;
				iMask++;
			}
		}

		let restOutput = '';
		while (iMask < mask.length && masked) {
			const cMask = mask[iMask];
			if (tokens[cMask]) {
				restOutput = '';
				break;
			}
			restOutput += cMask;
			iMask++;
		}

		return output + restOutput;
	}

	static masker(value: string, mask: string | undefined = undefined, masked = true, tokens: Tokens) {
		return Array.isArray(mask) ? this.dynamicMask(Mask.maskIt, mask, tokens)(value, masked) : this.maskIt(value, mask, masked, tokens);
	}
}

export const masked = (el: HTMLInputElement, mask?: string, tokens?: Tokens) => {
	const config = {
		mask,
		tokens: tokens ? { ...Mask.tokens, ...tokens } : Mask.tokens
	};

	if (el.tagName.toLocaleUpperCase() !== 'INPUT') {
		const els = el.getElementsByTagName('input');
		if (els.length !== 1) {
			throw new Error('mask requires 1 input, found ' + els.length);
		} else {
			el = els[0];
		}
	}
	if (config.mask) {
		el.oninput = function (evt) {
			if (!evt.isTrusted) return;
			let position = el.selectionEnd;
			if (position) {
				const digit = el.value[position - 1];
				el.value = Mask.masker(el.value, config.mask, true, config.tokens);
				while (position < el.value.length && el.value.charAt(position - 1) !== digit) {
					position++;
				}
			}
			if (el === document.activeElement) {
				el.setSelectionRange(position, position);
				setTimeout(function () {
					el.setSelectionRange(position, position);
				}, 0);
			}
			el.dispatchEvent(new Event('input'));
		};

		const newDisplay = Mask.masker(el.value, config.mask, true, config.tokens);
		if (newDisplay !== el.value) {
			el.value = newDisplay;
			el.dispatchEvent(new Event('input'));
		}
	}
};
