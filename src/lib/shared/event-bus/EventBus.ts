import { EventBus } from '../../external/tools/index.js';
import { createPresenter } from '../../external/edges/Edges.js';

declare global {
	// Namespace augmentation is required for SvelteKit's App.CustomEvents contract.
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace App {
		interface CustomEvents {
			readonly __azureNetEvents__?: never;
		}
	}
}

export type AppEventsList = App.CustomEvents extends { list: infer TEvents extends object } ? TEvents : Record<never, never>;

export const AppEvents: () => EventBus<AppEventsList> = createPresenter<EventBus<AppEventsList>>(() => new EventBus<AppEventsList>({}));
