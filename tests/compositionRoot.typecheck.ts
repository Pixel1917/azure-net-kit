import { expectTypeOf } from 'vitest';
import { CompositionRoot } from '../src/lib/shared/boundary-provider/CompositionRoot.js';
import { CreateServiceContainer } from '../src/lib/shared/boundary-provider/Provider.js';

const http = new CompositionRoot({ register: () => ({ datasource: () => ({ url: '/api', get: async () => 42 }) }) });
const legacy = CreateServiceContainer('typed-legacy', { register: () => ({ token: () => 'token' }) });
const identity = new CompositionRoot({
	dependsOn: { http, legacy },
	register: ({ http, legacy }) => {
		expectTypeOf(http.datasource.url).toEqualTypeOf<string>();
		expectTypeOf(legacy.token).toEqualTypeOf<string>();
		// @ts-expect-error Dependency services remain strictly inferred.
		void http.missing;
		return { Account: () => ({ get: () => http.datasource.get(), token: legacy.token }) };
	}
});
function check() {
	const { Account } = identity.resolve();
	expectTypeOf(Account.get()).toEqualTypeOf<Promise<number>>();
	expectTypeOf(Account.token).toEqualTypeOf<string>();
	// @ts-expect-error Unknown services must not be accepted.
	void identity.resolve().Missing;
}
void check;
