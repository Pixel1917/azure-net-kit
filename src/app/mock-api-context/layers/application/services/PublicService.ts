import { ClassMirror } from '$lib/index.js';
import { PublicRepository } from '../../infrastructure/http/repositories/index.js';

export class PublicService extends ClassMirror {
	constructor(private publicRepository: PublicRepository) {
		super(publicRepository);
	}

	async collection() {
		return this.publicRepository.collection();
	}

	declare willFail: PublicRepository['willFail'];
}
