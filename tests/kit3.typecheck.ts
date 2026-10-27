import { createApp } from '../src/lib/shared/app/App.js';
import type { IRedirectSettings } from '../src/lib/svelte/redirect/index.js';
createApp((app) =>
	app
		.useServerError((input) => {
			// @ts-expect-error Kit 3 errors do not expose a top-level status.
			void input.status;
			if (input.kind === 'unknown') {
				// @ts-expect-error Unknown errors must be narrowed before reading properties.
				void input.error.message;
			} else {
				const status: number = input.error.status;
				const message: string = input.error.message;
				void [status, message];
			}
			if (input.kind === 'validation') input.issues.map((issue) => issue.message);
			return { status: 503, message: 'Unavailable' };
		})
		.useClientError(({ kind, error }) => {
			if (kind !== 'unknown') return { status: error.status, message: error.message };
		})
);
const options: IRedirectSettings = {
	clientRedirectSettings: {
		shallow: true,
		replace: true,
		reset: false,
		refreshAll: true,
		persistState: true,
		state: {}
	}
};
void options;
