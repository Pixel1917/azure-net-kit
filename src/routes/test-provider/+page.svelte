<script lang="ts">
	import { TestProvider } from './TestProvider.js';
	import Comp from './Comp.svelte';

	const { bus } = TestProvider();

	const onclick = () => {
		bus.publish('test', 'hello-my-friend');
	};

	bus.subscribe('test', (data) => {
		console.log(data);
	});

	bus.subscribe('test2', (data) => {
		console.log(data);
	});
</script>

<button {onclick}>test</button>
<Comp />
