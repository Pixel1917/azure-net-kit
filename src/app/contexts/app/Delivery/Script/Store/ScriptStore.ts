import { createStore } from 'edges-svelte';

export const ScriptStore = createStore('ScriptStore', ({ createState }) => {
	//Store example
	const exampleState = createState('example');
	return { exampleState };
});
