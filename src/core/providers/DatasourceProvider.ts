import { MockApiDatasource } from '../datasources/index.js';
import { createHttpServiceInstance } from '$lib/infra.js';
import { createBoundaryProvider, UniversalCookie } from '$lib/index.js';

export const DatasourceProvider = createBoundaryProvider('CoreDatasourceProvider', {
	register: () => ({
		KosmoPartsRest: () =>
			new MockApiDatasource({
				http: createHttpServiceInstance({
					prefixUrl: 'https://cb784374e7b649a4b5ced37b17042896.fake-api.io',
					onRequest: (request) => {
						request.headers.set('X-Custom', 'Custom');
						const token = UniversalCookie.get('mock-token');
						if (token) {
							request.headers.set('Authorization', `Bearer ${token}`);
						}
					}
				})
			})
	})
});
