import { ClassMirror } from '$lib/index.js';
import { ScriptRepository } from '../../Infrastructure/Http/Repositories/index.js';

export class ScriptService extends ClassMirror<ScriptRepository> {
	constructor(private scriptRepository: ScriptRepository) {
		super(scriptRepository);
	}

	declare collection: ScriptRepository['collection'];
	declare resource: ScriptRepository['resource'];
	declare create: ScriptRepository['create'];
	declare update: ScriptRepository['update'];
	declare remove: ScriptRepository['remove'];
}
