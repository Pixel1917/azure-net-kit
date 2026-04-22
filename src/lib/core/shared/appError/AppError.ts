import { HttpErrorTypes, HttpServiceError } from '../../infra/httpService/HttpServiceInstance.js';
import { type RequestErrors, SchemaFail } from '../../delivery/schema/Schema.js';
import { AsyncHelperError } from '../../delivery/injectableDependencies/AsyncHelpers.js';

export enum ErrorTypes {
	Http = 'Http',
	Schema = 'Schema',
	KitInternalError = 'AzureNetKitInternal',
	AsyncHelperError = 'AsyncHelperError',
	Unknown = 'Unknown'
}
export class AzureNetKitInternalError extends Error {}

export interface IAppError<T = unknown> {
	type: ErrorTypes;
	message: string;
	validation?: RequestErrors<T>;
	external: boolean;
	appErrorConvert?: boolean;
}

export class AppError<T = unknown> extends Error {
	public type: ErrorTypes = ErrorTypes.Unknown;
	public message: string;
	public external: boolean = false;
	public validation?: RequestErrors<T>;

	constructor(public error: Error) {
		super(error.message);
		this.message = error.message ?? 'Unknown error';
		this.parseError();
	}

	tryToGetExternalError<HttpServiceDataType = unknown>() {
		if (this.external && this.error instanceof HttpServiceError) {
			return <HttpServiceError<HttpServiceDataType>>this.error;
		}
		return undefined;
	}

	redeclareValidation<D = T>(validation: D) {
		this.validation = validation as unknown as RequestErrors<T>;
	}

	toPlainObject<CustomData extends object>(custom?: CustomData): IAppError<T> & CustomData {
		const customData: CustomData = custom ?? ({} as CustomData);
		return {
			message: this.message,
			type: this.type,
			external: this.external,
			validation: this.validation,
			appErrorConvert: true,
			...customData
		};
	}

	private parseError() {
		switch (true) {
			case this.error instanceof HttpServiceError:
				this.type = ErrorTypes.Http;
				this.external = this.error.type === HttpErrorTypes.External;
				break;
			case this.error instanceof SchemaFail:
				this.type = ErrorTypes.Schema;
				this.validation = this.error.getSelfTypedData<T>();
				break;
			case this.error instanceof AzureNetKitInternalError:
				this.type = ErrorTypes.KitInternalError;
				break;
			case this.error instanceof AsyncHelperError:
				this.type = ErrorTypes.AsyncHelperError;
				break;
			default:
				this.type = ErrorTypes.Unknown;
		}
	}
}
