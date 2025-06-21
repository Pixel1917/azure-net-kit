import { BaseRequest } from '$lib/core/request/index.js';
import { Rules } from '$lib/core/request/rules/index.js';
import { validationMessagesRu } from '$lib/core/request/rules/messages/index.js';

const rules = new Rules(validationMessagesRu);

export interface ILoginRequest {
	email: string;
	password: string;
}

export class LoginRequest extends BaseRequest<ILoginRequest> {
	override rules() {
		return {
			email: [rules.required(), rules.email()],
			password: [rules.required(), rules.password({ length: 8, numbers: 1, lowerUpperCasePattern: true })]
		};
	}
}
