# Слой инфраструктуры (Infrastructure)

Слой инфраструктуры обеспечивает техническую реализацию приложения, включая HTTP клиенты, источники данных, построение запросов и обработку ответов.

### Провайдер источников данных

```typescript
// src/app/contexts/app/Infrastructure/Providers/DatasourceProvider.ts
import { createBoundaryProvider } from '$lib/index.js';
import { AzureNetRestDatasource } from '../../../core/Datasource/index.js';

export const DatasourceProvider = createBoundaryProvider('DatasourceProvider', {
	register: () => ({
		AzureNetRestDatasource: () =>
			new AzureNetRestDatasource({
				http: new HttpService({
					baseUrl: 'https://api.example.com',
					requestHandler: async (options) => {
						// Добавление токена авторизации
						const token = getToken();
						if (token) {
							options.headers = {
								...options.headers,
								Authorization: `Bearer ${token}`
							};
						}
					}
				})
			})
	})
});
```

## 🎯 Ключевые особенности

1. **Типизированные запросы** - полная поддержка TypeScript типов
2. **Гибкие форматы** - поддержка различных форматов сериализации
3. **Перехватчики** - возможность модификации запросов и ответов
4. **Обработка ошибок** - унифицированная система обработки ошибок
5. **Маппинг данных** - удобные инструменты для трансформации ответов
6. **Кеширование** - встроенная поддержка кеширования через провайдеры

Инфраструктурный слой обеспечивает надежную основу для взаимодействия с внешними сервисами и управления данными в приложении.
