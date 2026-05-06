import { createStore } from '$lib/delivery.js';

export const PublicStore = createStore('TestPublicStore', ({ createRawState }) => {
	const store = createRawState<string>('TestPublicStore');

	const setNewVal = () => {
		store.value = 'TestPublicStoreChanged';
	};

	return { store, setNewVal };
});
