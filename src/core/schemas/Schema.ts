import { createSchemaFactory } from '$lib/core/delivery.js';
import { createRules, validationMessagesI18n } from '$lib/core/delivery/schema/rules/index.js';

export const Schema = createSchemaFactory(createRules(validationMessagesI18n));
