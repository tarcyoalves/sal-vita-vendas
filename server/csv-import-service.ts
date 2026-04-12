import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { clients, leads } from "../drizzle/schema";
import { nanoid } from "nanoid";

export interface CsvRow {
  cnpj?: string;
  nome: string;
  contato?: string;
  telefone: string;
  cidade: string;
  uf: string;
  email?: string;
}

export interface DeduplicatedResult {
  duplicates: CsvRow[];
  unique: CsvRow[];
}

/**
 * Usar IA para remover duplicidades do CSV
 */
export async function deduplicateLeadsWithAI(
  rows: CsvRow[]
): Promise<DeduplicatedResult> {
  if (rows.length === 0) {
    return { duplicates: [], unique: [] };
  }

  const csvData = JSON.stringify(rows, null, 2);

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `Você é um especialista em análise de dados e deduplicação. 
        Sua tarefa é identificar registros duplicados em uma lista de leads.
        Dois registros são considerados duplicados se:
        - Têm o mesmo CNPJ (se ambos têm CNPJ)
        - Têm o mesmo telefone E mesmo nome similar
        - Têm o mesmo email (se ambos têm email)
        
        Retorne um JSON com dois arrays: "unique" (registros únicos) e "duplicates" (registros duplicados).`,
      },
      {
        role: "user",
        content: `Analise estes leads e remova duplicidades:\n\n${csvData}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "deduplication_result",
        strict: true,
        schema: {
          type: "object",
          properties: {
            unique: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  cnpj: { type: "string" },
                  nome: { type: "string" },
                  contato: { type: "string" },
                  telefone: { type: "string" },
                  cidade: { type: "string" },
                  uf: { type: "string" },
                  email: { type: "string" },
                },
                required: ["nome", "telefone", "cidade", "uf"],
              },
            },
            duplicates: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  cnpj: { type: "string" },
                  nome: { type: "string" },
                  contato: { type: "string" },
                  telefone: { type: "string" },
                  cidade: { type: "string" },
                  uf: { type: "string" },
                  email: { type: "string" },
                },
                required: ["nome", "telefone", "cidade", "uf"],
              },
            },
          },
          required: ["unique", "duplicates"],
          additionalProperties: false,
        },
      },
    },
  });

  try {
    const content = response.choices[0]?.message.content;
    if (typeof content === "string") {
      const parsed = JSON.parse(content);
      return {
        unique: parsed.unique || [],
        duplicates: parsed.duplicates || [],
      };
    }
  } catch (error) {
    console.error("[CSV Import] Erro ao parsear resposta IA:", error);
  }

  return { unique: rows, duplicates: [] };
}

/**
 * Importar CSV e criar clientes + leads
 */
export async function importLeadsFromCsv(
  rows: CsvRow[],
  sellerId: number
): Promise<{ success: number; duplicates: number; errors: string[] }> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const { unique, duplicates } = await deduplicateLeadsWithAI(rows);
  const batchId = nanoid();
  let successCount = 0;
  const errors: string[] = [];

  // Importar registros únicos
  for (const row of unique) {
    try {
      // Criar cliente
      const clientResult = await db.insert(clients).values({
        cnpj: row.cnpj || null,
        name: row.nome,
        contact: row.contato || null,
        phone: row.telefone,
        city: row.cidade,
        state: row.uf,
        email: row.email || null,
        status: "prospect",
      });

      const clientId = (clientResult as any).insertId;

      // Criar lead
      await db.insert(leads).values({
        clientId,
        sellerId,
        importBatchId: batchId,
        status: "assigned",
      });

      successCount++;
    } catch (error) {
      errors.push(`Erro ao importar ${row.nome}: ${String(error)}`);
    }
  }

  return {
    success: successCount,
    duplicates: duplicates.length,
    errors,
  };
}
