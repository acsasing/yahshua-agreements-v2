-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "partnerId" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentVersionId" TEXT,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,

    CONSTRAINT "DocumentTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplateSection" (
    "id" TEXT NOT NULL,
    "documentTemplateVersionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEditable" BOOLEAN NOT NULL DEFAULT true,
    "kind" TEXT NOT NULL DEFAULT 'BODY',
    "content" JSONB NOT NULL,

    CONSTRAINT "DocumentTemplateSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_offeringId_partnerId_key" ON "DocumentTemplate"("offeringId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplateVersion_templateId_version_key" ON "DocumentTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplateSection_documentTemplateVersionId_sectionKe_key" ON "DocumentTemplateSection"("documentTemplateVersionId", "sectionKey");

-- AddForeignKey
ALTER TABLE "DocumentTemplateVersion" ADD CONSTRAINT "DocumentTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplateSection" ADD CONSTRAINT "DocumentTemplateSection_documentTemplateVersionId_fkey" FOREIGN KEY ("documentTemplateVersionId") REFERENCES "DocumentTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
