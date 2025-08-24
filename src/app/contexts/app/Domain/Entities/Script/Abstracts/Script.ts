import { ScriptPositions, ScriptTypes } from '../Enums/index.js';

export interface IScript {
	id: number;
	company_id: number;
	type: ScriptTypes;
	position: ScriptPositions;
	name: string;
	text: string;
	timeout: string;
	created_at: string;
	updated_at: string;
	created_by: number;
	updated_by: number;
}
