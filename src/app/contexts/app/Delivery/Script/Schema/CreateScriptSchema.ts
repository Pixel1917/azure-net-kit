import { Schema } from '../../../../../core/index.js';
import type { IScriptCreateRequest } from '../../../Domain/Ports/Script/index.js';

export const CreateScriptSchema = Schema<IScriptCreateRequest>()
	.rules((rules) => ({
		name: [rules.string(), rules.required()]
	}))
	.create();
