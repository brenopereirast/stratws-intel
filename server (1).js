import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { join } from "path";

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors());
app.use(express.json());
app.use(express.static(join(process.cwd(), "public")));

app.post("/api/analyze", async (req, res) => {
  const { linkedin_url } = req.body;

  if (!linkedin_url) {
    return res.status(400).json({ error: "linkedin_url obrigatorio" });
  }

  if (!API_KEY) {
    return res.status(401).json({ error: "API key nao configurada no servidor." });
  }

  const slug = (linkedin_url.replace(/\/$/, "").split("/").pop() || "").split("?")[0];
  const companyGuess = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  console.log(`Analisando: ${linkedin_url}`);

  const prompt = `Você é um analista de inteligência de vendas B2B da Siteware, empresa que vende o STRATWs One — software de gestão estratégica que centraliza KPIs, metas, planos de ação, avaliação de desempenho, remuneração variável e gestão de reuniões em uma única plataforma.

URL LinkedIn da empresa: ${linkedin_url}
Nome estimado: ${companyGuess}

PASSO 1 — PESQUISE na web:
1. Contratações recentes de C-Level (CEO novo, CFO, COO, Head de RH, VP Operações, Diretor de Estratégia)
2. Vagas abertas de gestão, planejamento estratégico, controladoria, RH, operações
3. Expansão: novas filiais, mercados, produtos, internacionalização
4. Funding, investimentos, acquisitions, mudança societária
5. Notícias de crescimento acelerado, reestruturação ou transformação
6. Posts de liderança sobre desafios de gestão, metas, indicadores, estratégia
7. Porte e setor da empresa

PASSO 2 — CLASSIFIQUE cada sinal:
- QUENTE 🔴: empresa claramente precisando organizar gestão, estratégia ou pessoas (crescimento rápido sem processo, novo CEO/gestor querendo implantar cultura de resultados, expansão desordenada, RH sobrecarregado)
- MORNO 🟡: sinais de que podem ter interesse mas sem urgência clara
- FRIO 🔵: contexto favorável mas sem trigger específico

PASSO 3 — GERE a mensagem personalizada de prospecção para LinkedIn (máx 280 caracteres), usando o sinal mais forte como gatilho, conectando à dor de gestão e propondo o STRATWs como solução. Tom: direto, executivo, sem parecer spam. NÃO mencione "STRATWs" ou "Siteware" na mensagem — foque na dor.

Responda SOMENTE JSON válido, sem texto fora, sem markdown:
{
  "empresa": "nome real",
  "setor": "setor",
  "porte": "startup | PME | mid-market | enterprise",
  "score": 0,
  "score_label": "QUENTE | MORNO | FRIO",
  "sinais": [
    {
      "tipo": "QUENTE | MORNO | FRIO",
      "titulo": "titulo curto",
      "descricao": "descricao especifica com data/fonte se possivel",
      "impacto": "por que indica momento de compra para o STRATWs"
    }
  ],
  "pessoas_chave": [
    {
      "nome": "nome ou Identificar via Sales Navigator",
      "cargo": "cargo",
      "por_que_abordar": "por que essa pessoa agora"
    }
  ],
  "contexto": "2-3 frases sobre o momento atual da empresa",
  "mensagem_linkedin": "mensagem personalizada de ate 280 chars usando o sinal mais forte como gatilho",
  "recomendacao": "como abordar: qual sinal usar, qual dor mencionar, qual modulo do STRATWs resolve"
}`;

  try {
    const apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2500,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await apiResponse.json();

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    let rawText = "";
    for (const block of data.content || []) {
      if (block.type === "text") rawText += block.text;
    }

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: "Resposta invalida da IA", raw: rawText.slice(0, 300) });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`OK: ${parsed.empresa} | score: ${parsed.score}`);
    return res.json({ success: true, data: parsed });

  } catch (err) {
    console.log("Erro:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`STRATWs Intel rodando em http://localhost:${PORT}`);
  console.log(`API key: ${API_KEY ? "configurada" : "NAO CONFIGURADA"}`);
});
