import { AppPresenter } from '../../../../core/Presenter/index.js';
import { ApplicationProvider } from '../../Application/index.js';
import { CreateScriptSchema, UpdateScriptSchema } from './Schema/index.js';
import type { IScriptCreateRequest, IScriptUpdateRequest } from '../../Domain/Ports/Script/index.js';

export const ScriptPresenter = AppPresenter('ScriptPresenter', ({ createAsyncResource, createAsyncAction }) => {
	const { ScriptService } = ApplicationProvider();

	const collection = async () => await createAsyncResource(ScriptService.collection());

	const resource = async (id: number) => await createAsyncResource(ScriptService.resource(id));

	const create = async (request: IScriptCreateRequest) =>
		await createAsyncAction(ScriptService.create(CreateScriptSchema.from(request).json()), {
			onSuccess: () => {
				//TODO: add notification and redirect;
			}
		});

	const update = async (id: number, request: IScriptUpdateRequest) =>
		await createAsyncAction(ScriptService.update(id, UpdateScriptSchema.from(request).json()));

	const remove = async (id: number) => await createAsyncAction(ScriptService.remove(id));

	return { collection, resource, create, update, remove };
});
