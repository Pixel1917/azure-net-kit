import type { IScript } from '../../Entities/Script/index.js';

export type IScriptCreateRequest = Pick<IScript, 'type' | 'position' | 'name' | 'text' | 'timeout'>;

export type IScriptUpdateRequest = Partial<IScriptCreateRequest>;
