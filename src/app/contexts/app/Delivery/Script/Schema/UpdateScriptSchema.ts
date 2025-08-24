import { Schema } from '../../../../../core/index.js';
import type { IScriptUpdateRequest } from '../../../Domain/Ports/Script/index.js';

export const UpdateScriptSchema = Schema<IScriptUpdateRequest>()
	.rules((rules) => ({
		name: [rules.string()]
	}))
	.create();
