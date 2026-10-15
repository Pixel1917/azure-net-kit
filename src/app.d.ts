import type { Translation } from './lib/i18n/index.js';
import type { IUser } from './app/contexts/app/Domain/Entities/User/index.js';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface RequestContextState {
			demoMessage?: string;
		}
		// interface Error {}
		interface Locals {
			lang: string;
			user?: IUser;
			translations: Translation;
		}
		interface PageData {
			user?: IUser;
		}
		// interface PageState {}
		// interface Platform {}
		interface CustomEvents {
			list: Record<never, never>;
		}
	}
}

export {};
