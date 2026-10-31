import { HttpServiceInstance } from '../src/lib/infra/http-service/HttpServiceInstance.js';

new HttpServiceInstance({
	retry: {
		limit: 1,
		shouldRetry(context) {
			void context.error;
			// @ts-expect-error Recovery receives no HTTP client.
			void context.http;
			return false;
		}
	},
	onError(context) {
		void context.error;
		void context.request;
		// @ts-expect-error Error handlers receive no HTTP client.
		void context.http;
	}
});
