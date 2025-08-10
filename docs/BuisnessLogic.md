## Domain логика vs Application логика

Domain логика - "ЧТО" (правила предметной области)

1. Существует независимо от приложения
2. Инварианты и ограничения
3. Вычисления и трансформации

Application логика - "КАК" (сценарии использования)

1. Оркестрация и координация
2. Последовательность шагов
3. Взаимодействие с внешним миром
4. Побочные эффекты

```ts
// DOMAIN логика - правила расчета скидок
// src/domain/pricing/entities/Discount.ts
export class Discount {
	constructor(
		public type: DiscountType,
		public value: number,
		public conditions: DiscountCondition[]
	) {}

	// Domain: МОЖЕТ ЛИ скидка применяться?
	isApplicable(cart: Cart, customer: Customer): boolean {
		return this.conditions.every((condition) => condition.isSatisfied(cart, customer));
	}

	// Domain: КАК рассчитывается скидка?
	calculate(basePrice: Money): Money {
		switch (this.type) {
			case DiscountType.PERCENTAGE:
				return basePrice.multiply(this.value / 100);
			case DiscountType.FIXED:
				return new Money(this.value, basePrice.currency);
			case DiscountType.BUY_X_GET_Y:
				return this.calculateBuyXGetY(basePrice);
		}
	}
}

// src/domain/pricing/services/PricingService.ts
export class PricingService {
	// Domain: сложная логика комбинирования скидок
	calculateFinalPrice(cart: Cart, customer: Customer, discounts: Discount[]): PriceBreakdown {
		const basePrice = cart.calculateSubtotal();
		const applicableDiscounts = discounts.filter((d) => d.isApplicable(cart, customer));

		// Бизнес-правило: скидки не суммируются, берется максимальная
		const bestDiscount = this.findBestDiscount(applicableDiscounts, basePrice);

		return {
			subtotal: basePrice,
			discount: bestDiscount?.calculate(basePrice) || Money.zero(),
			total: basePrice.subtract(bestDiscount?.calculate(basePrice))
		};
	}
}

// APPLICATION логика - сценарий применения скидки
// src/application/use-cases/ApplyPromoCodeUseCase.ts
export class ApplyPromoCodeUseCase {
	constructor(
		private cartRepo: ICartRepository,
		private discountRepo: IDiscountRepository,
		private pricingService: PricingService,
		private analytics: IAnalytics,
		private cache: ICache
	) {}

	async execute(input: ApplyPromoInput): Promise<ApplyPromoResult> {
		// 1. Application: Загрузка данных
		const cart = await this.cartRepo.findById(input.cartId);
		const customer = await this.customerRepo.findById(input.customerId);

		// 2. Application: Проверка существования промокода
		const discount = await this.discountRepo.findByCode(input.promoCode);
		if (!discount) {
			// Application: Логирование неудачных попыток
			await this.analytics.track('promo_code_invalid', {
				code: input.promoCode,
				customerId: input.customerId
			});
			throw new InvalidPromoCodeError();
		}

		// 3. Domain: Проверка применимости
		if (!discount.isApplicable(cart, customer)) {
			return {
				success: false,
				reason: this.getInapplicabilityReason(discount, cart, customer)
			};
		}

		// 4. Domain: Расчет новой цены
		const allDiscounts = await this.loadAllActiveDiscounts();
		const priceBreakdown = this.pricingService.calculateFinalPrice(cart, customer, [...allDiscounts, discount]);

		// 5. Application: Сохранение и кеширование
		cart.applyPromoCode(input.promoCode);
		await this.cartRepo.save(cart);

		await this.cache.set(
			`price:${cart.id}`,
			priceBreakdown,
			300 // 5 минут
		);

		// 6. Application: Аналитика
		await this.analytics.track('promo_code_applied', {
			code: input.promoCode,
			discountAmount: priceBreakdown.discount.value,
			customerId: input.customerId
		});

		return {
			success: true,
			priceBreakdown
		};
	}
}
```
