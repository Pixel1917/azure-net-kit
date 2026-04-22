import type { TranslationParam } from '../translations/index.js';
import type { ValidationParams, ValidationRuleResult } from '$lib/core/delivery.js';

type FileExtension = 'stl' | 'png' | 'jpg' | 'jpeg' | 'dwg' | 'gif' | 'webp' | 'csv' | 'doc' | 'docx' | 'pdf' | 'txt' | 'xlsx' | 'xls';

type ExtensionWithMime = {
	extension: FileExtension;
	mime: string;
};

const extensionsWithMimes: readonly ExtensionWithMime[] = [
	{ extension: 'stl', mime: 'model/stl' },
	{ extension: 'png', mime: 'image/png' },
	{ extension: 'jpg', mime: 'image/jpeg' },
	{ extension: 'jpeg', mime: 'image/jpeg' },
	{ extension: 'dwg', mime: 'application/dwg' },
	{ extension: 'gif', mime: 'image/gif' },
	{ extension: 'webp', mime: 'image/webp' },
	{ extension: 'csv', mime: 'text/csv' },
	{ extension: 'doc', mime: 'application/msword' },
	{ extension: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
	{ extension: 'pdf', mime: 'application/pdf' },
	{ extension: 'txt', mime: 'text/plain' },
	{ extension: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
	{ extension: 'xls', mime: 'application/vnd.ms-excel' }
] as const;

const extensionsBase: FileExtension[] = extensionsWithMimes.map((ext) => ext.extension);

export const file = <T = unknown, D = unknown>(params?: {
	maxFileSize?: number;
	extensions: FileExtension[];
	message?: TranslationParam;
	file?: File;
}): ValidationRuleResult<T, D> => {
	const maxFileSize = params && 'maxFileSize' in params ? params.maxFileSize : 50 * 1024 * 1024;
	const extensions = params && 'extensions' in params ? (params.extensions ?? []) : extensionsBase;
	const messageToReturn = params?.message ?? 'errors.fileNotValid';
	const getExtension = (name: string) => {
		const arr = name.split('.');
		return arr[arr.length - 1] as FileExtension;
	};
	return ({ val }: ValidationParams<T, D>) => {
		if (val) {
			if (val instanceof File && val.size > 0) {
				const mime = val.type;
				const extension = getExtension(val.name);
				switch (true) {
					case maxFileSize && val.size > maxFileSize:
						return { key: 'errors.fileMoreThan', vars: { size: maxFileSize / 1048576 } };
					case !!extensions?.length:
						if (!extensions.includes(extension)) {
							const extMime = extensionsWithMimes.find((ext) => ext.mime === mime);
							if (!extMime || !extensions.includes(extMime.extension)) {
								return { key: 'errors.onlyExtensions', vars: { extensions: extensions.join(', ') } };
							}
							return undefined;
						}
						return undefined;
					default:
						return undefined;
				}
			}
			return messageToReturn;
		}
		return undefined;
	};
};
