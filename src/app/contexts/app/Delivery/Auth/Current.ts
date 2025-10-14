import { createStore } from 'edges-svelte';
import type { IUser } from '../../Domain/Entities/User/index.js';

export const CurrentUser = createStore('CurrentUserStore', ({ createRawState }) => {
	const user = createRawState<IUser | undefined>(undefined);
	return { user };
});
