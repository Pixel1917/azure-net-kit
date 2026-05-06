import { createRules, validationMessagesI18n, createSchemaFactory } from '$lib/delivery.js';

export const Schema = createSchemaFactory(createRules(validationMessagesI18n));
