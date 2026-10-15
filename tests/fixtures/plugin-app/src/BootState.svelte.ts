import { RegisterProvider } from '@azure-net/kit/delivery';
class BootState {
	value = $state('empty');
}
export const useBootState = RegisterProvider(() => new BootState(), 'singleton');
