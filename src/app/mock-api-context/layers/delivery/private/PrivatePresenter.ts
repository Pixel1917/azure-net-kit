import { AppPresenter } from '../../../../../core/presenters/index.js';
import { ApplicationProvider } from '../../application/providers/index.js';

export const PrivatePresenter = AppPresenter('MockContextPrivatePresenter', ({ createAsyncResource }) => {
	const { PrivateService } = ApplicationProvider();

	const collection = () => createAsyncResource(() => PrivateService.collection());

	return { collection };
});
