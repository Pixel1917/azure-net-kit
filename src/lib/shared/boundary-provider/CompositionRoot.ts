import { CreateServiceContainer, type ProviderSettings, type ProviderWithType } from './Provider.js';

type Services = Record<string, () => unknown>;
type Dependency = ProviderWithType<Services> | { readonly resolve: ProviderWithType<Services> };
type Dependencies = Record<string, Dependency>;
const toProvider = (dependency: Dependency): ProviderWithType<Services> => (typeof dependency === 'function' ? dependency : dependency.resolve);
type Providers<D extends Dependencies> = {
	[K in keyof D]: D[K] extends { readonly resolve: infer P extends ProviderWithType<Services> }
		? P
		: D[K] extends ProviderWithType<Services>
			? D[K]
			: never;
};

export type CompositionRootSettings<T extends Services, D extends Dependencies = Record<never, never>> = Omit<
	ProviderSettings<T, Providers<D>>,
	'dependsOn'
> & { dependsOn?: D };

/** Holds registration metadata only. Resolving always uses the current request's container. */
export class CompositionRoot<T extends Services, D extends Dependencies = Record<never, never>> {
	readonly name = Symbol('@azure-net/kit:CompositionRoot');
	readonly resolve: ProviderWithType<T>;

	constructor(settings: CompositionRootSettings<T, D>) {
		const dependsOn = Object.fromEntries(
			Object.entries(settings.dependsOn ?? {}).map(([key, dependency]) => [key, toProvider(dependency as Dependency)])
		) as Providers<D>;
		this.resolve = CreateServiceContainer(this.name, { ...settings, dependsOn });
	}
}
