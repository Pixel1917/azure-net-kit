import { RegisterProvider } from '#lib/delivery.js';
class PublicState {
	store = $state({ value: 'TestPublicStore' });
	setNewVal = () => {
		this.store.value = 'TestPublicStoreChanged';
	};
}
export const PublicStore = RegisterProvider(() => new PublicState(), 'singleton');
