import { Schema } from '../../../../../core/index.js';
import type { ILoginRequest } from '../../../Domain/Ports/Auth/index.js';

export const LoginSchema = Schema<ILoginRequest>()
	.rules((rules) => ({
		email: [rules.string(), rules.email()],
		password: [rules.string(), rules.password({ lowerUpperCasePattern: true, length: 8, numbers: 1 })]
	}))
	.create();
