/**
 * Catálogo de Documentos — backend da página /documentos.
 *
 * A página guardava anexos e fotos no IndexedDB do navegador. Consequência:
 * o laudo que o admin subia não existia para as atendentes, cada máquina tinha
 * a sua própria cópia, nada entrava no backup e limpar os dados do navegador
 * apagava tudo. Aqui o conteúdo passa a viver no Postgres, compartilhado.
 *
 * Sobre guardar base64 no banco: este projeto não tem storage de objetos
 * (S3/Blob), e o volume é de poucas dezenas de laudos e certificados. Para não
 * pagar esse peso a cada carregamento, `list` devolve SÓ metadados — o binário
 * é buscado sob demanda em `getContent`, no clique de baixar/visualizar.
 */

import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, staffProcedure } from '../trpc';
import { db } from '../db';
import { catalogDocuments, catalogImages } from '../db/schema';

// O corpo aceito pelo Express é de 4mb (api/index.ts) e base64 infla ~33%,
// então o arquivo cru precisa ficar bem abaixo disso. 2,5 MB deixa margem para
// o resto do payload JSON.
const MAX_FILE_BYTES = 2.5 * 1024 * 1024;

const ownerType = z.enum(['product', 'company']);

/** Estima o tamanho em bytes do binário por trás de uma data URL base64. */
function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function assertDataUrl(value: string, label: string) {
  if (!value.startsWith('data:')) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `${label} inválido.` });
  }
  if (dataUrlBytes(value) > MAX_FILE_BYTES) {
    throw new TRPCError({
      code: 'PAYLOAD_TOO_LARGE',
      message: `${label} excede 2,5 MB. Comprima o arquivo e tente de novo.`,
    });
  }
}

export const catalogRouter = router({
  /**
   * Metadados de todos os anexos + as fotos personalizadas. Sem `content`:
   * trazer o base64 de todos os anexos aqui faria a página baixar megabytes a
   * cada abertura.
   */
  list: protectedProcedure.query(async () => {
    const docs = await db
      .select({
        id: catalogDocuments.id,
        ownerType: catalogDocuments.ownerType,
        ownerId: catalogDocuments.ownerId,
        title: catalogDocuments.title,
        fileName: catalogDocuments.fileName,
        fileType: catalogDocuments.fileType,
        fileSize: catalogDocuments.fileSize,
        uploadedByName: catalogDocuments.uploadedByName,
        createdAt: catalogDocuments.createdAt,
      })
      .from(catalogDocuments)
      .orderBy(desc(catalogDocuments.createdAt));

    const images = await db
      .select({ ownerId: catalogImages.ownerId, imageUrl: catalogImages.imageUrl })
      .from(catalogImages);

    return { documents: docs, images };
  }),

  /** Binário de um anexo, buscado só quando o usuário baixa ou visualiza. */
  getContent: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [doc] = await db
        .select({
          content: catalogDocuments.content,
          fileName: catalogDocuments.fileName,
          title: catalogDocuments.title,
        })
        .from(catalogDocuments)
        .where(eq(catalogDocuments.id, input.id));
      if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Documento não encontrado.' });
      return doc;
    }),

  /** Anexa um arquivo a um produto ou card da empresa. */
  addDocument: staffProcedure
    .input(
      z.object({
        ownerType,
        ownerId: z.string().min(1).max(120),
        title: z.string().min(1).max(200),
        fileName: z.string().max(260).optional(),
        fileType: z.string().max(30).default('PDF'),
        fileSize: z.string().max(40).optional(),
        content: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      assertDataUrl(input.content, 'Arquivo');
      const [created] = await db
        .insert(catalogDocuments)
        .values({
          ownerType: input.ownerType,
          ownerId: input.ownerId,
          title: input.title.trim(),
          fileName: input.fileName ?? null,
          fileType: input.fileType,
          fileSize: input.fileSize ?? null,
          content: input.content,
          uploadedByUserId: ctx.user.id,
          uploadedByName: ctx.user.name ?? null,
        })
        .returning({ id: catalogDocuments.id });
      return created;
    }),

  deleteDocument: staffProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const deleted = await db
        .delete(catalogDocuments)
        .where(eq(catalogDocuments.id, input.id))
        .returning({ id: catalogDocuments.id });
      if (deleted.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Documento não encontrado.' });
      }
      return { ok: true };
    }),

  /** Define (ou troca) a foto de um produto. Uma linha por produto. */
  setImage: staffProcedure
    .input(z.object({ ownerId: z.string().min(1).max(120), imageUrl: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      assertDataUrl(input.imageUrl, 'Imagem');
      await db
        .insert(catalogImages)
        .values({
          ownerId: input.ownerId,
          imageUrl: input.imageUrl,
          updatedByUserId: ctx.user.id,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: catalogImages.ownerId,
          set: { imageUrl: input.imageUrl, updatedByUserId: ctx.user.id, updatedAt: new Date() },
        });
      return { ok: true };
    }),

  /** Remove a foto personalizada, voltando à ilustração padrão do card. */
  resetImage: staffProcedure
    .input(z.object({ ownerId: z.string().min(1).max(120) }))
    .mutation(async ({ input }) => {
      await db.delete(catalogImages).where(eq(catalogImages.ownerId, input.ownerId));
      return { ok: true };
    }),

  /**
   * Importa o que já estava no IndexedDB do navegador de quem abriu a página,
   * para que os arquivos subidos antes desta correção não se percam. Idempotente
   * por (ownerType, ownerId, title): reexecutar não duplica.
   */
  migrateFromLocal: staffProcedure
    .input(
      z.object({
        documents: z
          .array(
            z.object({
              ownerType,
              ownerId: z.string().min(1).max(120),
              title: z.string().min(1).max(200),
              fileName: z.string().max(260).optional(),
              fileType: z.string().max(30).default('PDF'),
              fileSize: z.string().max(40).optional(),
              content: z.string().min(1),
            }),
          )
          .max(100),
        images: z
          .array(z.object({ ownerId: z.string().min(1).max(120), imageUrl: z.string().min(1) }))
          .max(60),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      let docsImported = 0;
      let imagesImported = 0;

      for (const d of input.documents) {
        if (!d.content.startsWith('data:') || dataUrlBytes(d.content) > MAX_FILE_BYTES) continue;
        const [dup] = await db
          .select({ id: catalogDocuments.id })
          .from(catalogDocuments)
          .where(
            and(
              eq(catalogDocuments.ownerType, d.ownerType),
              eq(catalogDocuments.ownerId, d.ownerId),
              eq(catalogDocuments.title, d.title.trim()),
            ),
          )
          .limit(1);
        if (dup) continue;
        await db.insert(catalogDocuments).values({
          ownerType: d.ownerType,
          ownerId: d.ownerId,
          title: d.title.trim(),
          fileName: d.fileName ?? null,
          fileType: d.fileType,
          fileSize: d.fileSize ?? null,
          content: d.content,
          uploadedByUserId: ctx.user.id,
          uploadedByName: ctx.user.name ?? null,
        });
        docsImported++;
      }

      for (const img of input.images) {
        if (!img.imageUrl.startsWith('data:') || dataUrlBytes(img.imageUrl) > MAX_FILE_BYTES) continue;
        const [existing] = await db
          .select({ ownerId: catalogImages.ownerId })
          .from(catalogImages)
          .where(eq(catalogImages.ownerId, img.ownerId))
          .limit(1);
        if (existing) continue; // não sobrescreve o que já está no servidor
        await db.insert(catalogImages).values({
          ownerId: img.ownerId,
          imageUrl: img.imageUrl,
          updatedByUserId: ctx.user.id,
        });
        imagesImported++;
      }

      return { docsImported, imagesImported };
    }),
});
