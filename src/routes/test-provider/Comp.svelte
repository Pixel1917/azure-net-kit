<script lang="ts">
	import { TestProvider } from './TestProvider.js';

	const { bus } = TestProvider();

	const onclick = () => {
		bus.publish('test2', 'some-tasty-shit-from-test2');
		bus.publish('test', 'some-tasty-shit-from-test1');
	};
</script>

<button {onclick}>from comp</button>
