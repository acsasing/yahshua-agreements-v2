-- CreateEnum
CREATE TYPE "PricingShape" AS ENUM ('FLAT', 'PER_UNIT', 'BASE_PLUS_EXCESS', 'TIER_LOOKUP', 'TIER_PROGRESSIVE', 'MULTI_FACTOR');

-- CreateEnum
CREATE TYPE "ChargeKind" AS ENUM ('RECURRING', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "VatMode" AS ENUM ('EXCLUSIVE', 'INCLUSIVE', 'NONE');

-- CreateEnum
CREATE TYPE "PoolingPolicy" AS ENUM ('PER_ENTITY', 'POOLED');

-- CreateEnum
CREATE TYPE "QuantityBasis" AS ENUM ('ENTITY', 'POOLED');

-- CreateEnum
CREATE TYPE "QuantityBand" AS ENUM ('TOTAL', 'EXCESS');

-- CreateEnum
CREATE TYPE "RuleScope" AS ENUM ('COMPONENT', 'PRODUCT', 'QUOTE_TOTAL');

-- CreateEnum
CREATE TYPE "RuleOrigin" AS ENUM ('CATALOG', 'QUOTE');

-- CreateEnum
CREATE TYPE "EffectType" AS ENUM ('WAIVE', 'PERCENT_OFF', 'FIXED_OFF');

-- CreateEnum
CREATE TYPE "ConditionType" AS ENUM ('LOCKIN_YEARS_AT_LEAST', 'TERM_MONTHS_AT_LEAST', 'QUANTITY_AT_LEAST', 'QUANTITY_AT_MOST', 'BILLING_DATE_WITHIN', 'RATE_CARD_IS', 'PRODUCT_SELECTED', 'SETUP_ENABLED');

-- CreateEnum
CREATE TYPE "ValidationSeverity" AS ENUM ('WARN', 'BLOCK');

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "defaultRateCardId" TEXT;

-- CreateTable
CREATE TABLE "QuantityDriver" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "isPerEntity" BOOLEAN NOT NULL DEFAULT true,
    "isMoney" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "QuantityDriver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingComponent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentVersionId" TEXT,

    CONSTRAINT "PricingComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingComponentVersion" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "shape" "PricingShape" NOT NULL,
    "chargeKind" "ChargeKind" NOT NULL,
    "quantityDriverKey" TEXT,
    "poolingPolicy" "PoolingPolicy" NOT NULL DEFAULT 'PER_ENTITY',
    "vatMode" "VatMode" NOT NULL DEFAULT 'EXCLUSIVE',
    "vatRatePctPin" DECIMAL(6,3),
    "lineLabelTemplate" TEXT,
    "noteTemplate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,

    CONSTRAINT "PricingComponentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCard" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inheritsFromId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentVersionId" TEXT,

    CONSTRAINT "RateCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCardVersion" (
    "id" TEXT NOT NULL,
    "rateCardId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3),
    "note" TEXT,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "RateCardVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCardEntry" (
    "id" TEXT NOT NULL,
    "rateCardVersionId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "shapeOverride" "PricingShape",
    "config" JSONB NOT NULL,
    "vatModeOverride" "VatMode",
    "currency" TEXT NOT NULL DEFAULT 'PHP',

    CONSTRAINT "RateCardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateTier" (
    "id" TEXT NOT NULL,
    "rateCardEntryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "minUnit" INTEGER NOT NULL,
    "maxUnit" INTEGER,
    "value" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "RateTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingProduct" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentVersionId" TEXT,

    CONSTRAINT "PricingProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingProductVersion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PricingProductVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductComponent" (
    "id" TEXT NOT NULL,
    "productVersionId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offering" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "allowsGroup" BOOLEAN NOT NULL DEFAULT false,
    "allowsTotalDiscount" BOOLEAN NOT NULL DEFAULT true,
    "allowsManualOverride" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Offering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferingProduct" (
    "offeringId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "OfferingProduct_pkey" PRIMARY KEY ("offeringId","productId")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "RuleScope" NOT NULL,
    "componentId" TEXT,
    "productId" TEXT,
    "offeringId" TEXT,
    "rateCardId" TEXT,
    "appliesToChargeKind" "ChargeKind",
    "effectType" "EffectType" NOT NULL,
    "effectValue" DECIMAL(14,4),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRuleCondition" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT,
    "productComponentId" TEXT,
    "validationId" TEXT,
    "type" "ConditionType" NOT NULL,
    "intValue" INTEGER,
    "decimalValue" DECIMAL(14,4),
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "quantityDriverKey" TEXT,
    "quantityBasis" "QuantityBasis",
    "stringValues" TEXT[],
    "boolValue" BOOLEAN,

    CONSTRAINT "PricingRuleCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingValidation" (
    "id" TEXT NOT NULL,
    "componentId" TEXT,
    "productId" TEXT,
    "offeringId" TEXT,
    "severity" "ValidationSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PricingValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteAdjustment" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "scope" "RuleScope" NOT NULL,
    "componentId" TEXT,
    "productId" TEXT,
    "appliesToChargeKind" "ChargeKind",
    "effectType" "EffectType" NOT NULL,
    "effectValue" DECIMAL(14,4),
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "label" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "rateCardId" TEXT NOT NULL,
    "partnerId" TEXT,
    "lockinYears" INTEGER NOT NULL DEFAULT 0,
    "termMonths" INTEGER NOT NULL DEFAULT 12,
    "subscriptionStart" TIMESTAMP(3) NOT NULL,
    "billingLeadDays" INTEGER NOT NULL DEFAULT 5,
    "setupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "vatRatePct" DECIMAL(6,3) NOT NULL DEFAULT 12,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "manualOverrideEnabled" BOOLEAN NOT NULL DEFAULT false,
    "manualRecurringTotal" DECIMAL(14,4),
    "manualOneTimeTotal" DECIMAL(14,4),
    "manualOverrideReason" TEXT,
    "manualOverrideById" TEXT,
    "manualOverrideAt" TIMESTAMP(3),
    "pinnedRateCardVersionId" TEXT,
    "pricingPlanSnapshot" JSONB,
    "engineVersion" TEXT,
    "snapshotHash" TEXT,
    "snapshotAt" TIMESTAMP(3),

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteEntity" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tin" TEXT,
    "poolOrder" INTEGER NOT NULL,

    CONSTRAINT "QuoteEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteEntityQuantity" (
    "id" TEXT NOT NULL,
    "quoteEntityId" TEXT NOT NULL,
    "driverKey" TEXT NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "QuoteEntityQuantity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteAdHocItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "componentId" TEXT,
    "label" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "unitAmount" DECIMAL(14,4),
    "chargeKind" "ChargeKind" NOT NULL DEFAULT 'RECURRING',
    "vatMode" "VatMode" NOT NULL DEFAULT 'EXCLUSIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuoteAdHocItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "componentId" TEXT,
    "quoteEntityId" TEXT,
    "chargeKind" "ChargeKind" NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "quantity" DECIMAL(14,4),
    "positionStart" INTEGER,
    "positionEnd" INTEGER,
    "grossAmount" DECIMAL(14,4) NOT NULL,
    "discountAmount" DECIMAL(14,4) NOT NULL,
    "netAmount" DECIMAL(14,4) NOT NULL,
    "vatMode" "VatMode" NOT NULL,
    "vatRatePct" DECIMAL(6,3) NOT NULL,
    "vatAmount" DECIMAL(14,4) NOT NULL,
    "totalAmount" DECIMAL(14,4) NOT NULL,
    "breakdown" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLineRuleApplication" (
    "id" TEXT NOT NULL,
    "quoteLineId" TEXT NOT NULL,
    "ruleId" TEXT,
    "quoteAdjustmentId" TEXT,
    "origin" "RuleOrigin" NOT NULL,
    "effectType" "EffectType" NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "note" TEXT,

    CONSTRAINT "QuoteLineRuleApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteScheduleRow" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "chargeKind" "ChargeKind" NOT NULL,
    "label" TEXT NOT NULL,
    "baseAmount" DECIMAL(14,4) NOT NULL,
    "vatAmount" DECIMAL(14,4) NOT NULL,
    "totalAmount" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "QuoteScheduleRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuantityDriver_key_key" ON "QuantityDriver"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PricingComponent_key_key" ON "PricingComponent"("key");

-- CreateIndex
CREATE INDEX "PricingComponent_key_idx" ON "PricingComponent"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PricingComponentVersion_componentId_version_key" ON "PricingComponentVersion"("componentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RateCard_key_key" ON "RateCard"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RateCardVersion_rateCardId_version_key" ON "RateCardVersion"("rateCardId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RateCardEntry_rateCardVersionId_componentId_key" ON "RateCardEntry"("rateCardVersionId", "componentId");

-- CreateIndex
CREATE UNIQUE INDEX "RateTier_rateCardEntryId_sortOrder_key" ON "RateTier"("rateCardEntryId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PricingProduct_key_key" ON "PricingProduct"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PricingProductVersion_productId_version_key" ON "PricingProductVersion"("productId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProductComponent_productVersionId_componentId_key" ON "ProductComponent"("productVersionId", "componentId");

-- CreateIndex
CREATE UNIQUE INDEX "Offering_key_key" ON "Offering"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_key_rateCardId_version_key" ON "PricingRule"("key", "rateCardId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_agreementId_key" ON "Quote"("agreementId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteEntityQuantity_quoteEntityId_driverKey_key" ON "QuoteEntityQuantity"("quoteEntityId", "driverKey");

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_defaultRateCardId_fkey" FOREIGN KEY ("defaultRateCardId") REFERENCES "RateCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingComponentVersion" ADD CONSTRAINT "PricingComponentVersion_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PricingComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_inheritsFromId_fkey" FOREIGN KEY ("inheritsFromId") REFERENCES "RateCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCardVersion" ADD CONSTRAINT "RateCardVersion_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "RateCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCardEntry" ADD CONSTRAINT "RateCardEntry_rateCardVersionId_fkey" FOREIGN KEY ("rateCardVersionId") REFERENCES "RateCardVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCardEntry" ADD CONSTRAINT "RateCardEntry_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PricingComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateTier" ADD CONSTRAINT "RateTier_rateCardEntryId_fkey" FOREIGN KEY ("rateCardEntryId") REFERENCES "RateCardEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingProductVersion" ADD CONSTRAINT "PricingProductVersion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PricingProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductComponent" ADD CONSTRAINT "ProductComponent_productVersionId_fkey" FOREIGN KEY ("productVersionId") REFERENCES "PricingProductVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductComponent" ADD CONSTRAINT "ProductComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PricingComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingProduct" ADD CONSTRAINT "OfferingProduct_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingProduct" ADD CONSTRAINT "OfferingProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PricingProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PricingComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "RateCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRuleCondition" ADD CONSTRAINT "PricingRuleCondition_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PricingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRuleCondition" ADD CONSTRAINT "PricingRuleCondition_productComponentId_fkey" FOREIGN KEY ("productComponentId") REFERENCES "ProductComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRuleCondition" ADD CONSTRAINT "PricingRuleCondition_validationId_fkey" FOREIGN KEY ("validationId") REFERENCES "PricingValidation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteAdjustment" ADD CONSTRAINT "QuoteAdjustment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteAdjustment" ADD CONSTRAINT "QuoteAdjustment_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PricingComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteEntity" ADD CONSTRAINT "QuoteEntity_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteEntityQuantity" ADD CONSTRAINT "QuoteEntityQuantity_quoteEntityId_fkey" FOREIGN KEY ("quoteEntityId") REFERENCES "QuoteEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteAdHocItem" ADD CONSTRAINT "QuoteAdHocItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PricingComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteEntityId_fkey" FOREIGN KEY ("quoteEntityId") REFERENCES "QuoteEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLineRuleApplication" ADD CONSTRAINT "QuoteLineRuleApplication_quoteLineId_fkey" FOREIGN KEY ("quoteLineId") REFERENCES "QuoteLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteScheduleRow" ADD CONSTRAINT "QuoteScheduleRow_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
