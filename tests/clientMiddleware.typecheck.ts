import type { IClientMiddleware } from '../src/lib/shared/app/middleware/ClientMiddleware.js';

const syncMiddleware: IClientMiddleware = ({ next }) => {
	next();
};

// @ts-expect-error Client middleware must decide navigation synchronously.
const asyncMiddleware: IClientMiddleware = async ({ next }) => {
	next();
};

void syncMiddleware;
void asyncMiddleware;
