import config from './vitest.config.ts';

export default {
	...config,
	test: {
		...config.test,
		include: ['tests/i18n.retention.ts', 'tests/compositionRoot.retention.ts', 'tests/requestContext.retention.ts'],
		pool: 'forks' as const,
		execArgv: ['--expose-gc']
	}
};
