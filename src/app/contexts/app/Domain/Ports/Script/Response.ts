import type { IScript } from '../../Entities/Script/index.js';

export type IScriptCollection = IScript[];

export type IScriptCollectionQuery = {
	page?: number;
	'per-page'?: number;
};
