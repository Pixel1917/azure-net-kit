import config from './vitest.config';

export default {
	...config,
	test: {
		...config.test,
		include: ['tests/i18n.retention.ts'],
		pool: 'forks' as const,
		execArgv: ['--expose-gc']
	}
};
