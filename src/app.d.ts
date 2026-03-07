import type { Translation } from 'edges-svelte-translations';
import type { IUser } from './app/contexts/app/Domain/Entities/User/index.js';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
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
			eventNames: '';
		}
	}
}

export {};
