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

  const prompt = `Você é um analista sênior de inteligência de vendas B2B da Siteware, empresa que vende o STRATWs One — software de gestão estratégica que centraliza KPIs, metas, planos de ação, avaliação de desempenho, remuneração variável e gestão de reuniões em uma única plataforma. Clientes de referência: Vale, TV Globo, VLI, Unimed, Samarco, Centauro.

URL LinkedIn da empresa: ${linkedin_url}
Nome estimado: ${companyGuess}

Busque informações RECENTES (últimos 90 dias) sobre a empresa. Ignore sinais com mais de 120 dias.
 
Pesquise:
1. Novo C-Level assumindo cargo (CEO, CFO, COO, VP, Diretor) nos últimos 90 dias
2. Vagas abertas AGORA de gestão, planejamento estratégico, controladoria, RH, operações
3. Expansão ATIVA: novas filiais, novos mercados, lançamento de produto nos últimos 90 dias
4. Funding, investimento, acquisition ou mudança societária recente
5. Notícias recentes de crescimento acelerado, reestruturação ou transformação
6. Porte real da empresa e setor
 
PASSO 2 — CALCULE O SCORE (0-100)
Some os pontos APENAS para sinais dos últimos 90 dias:
- Novo C-Level assumiu cargo nos últimos 90 dias: +30
- Expansão ativa (nova filial, mercado ou produto): +20
- Funding ou acquisition recente: +20
- Vagas abertas de gestão/estratégia/RH: +15
- Crescimento acelerado com sinais de desorganização: +15
- Setor com alto fit STRATWs (indústria, saúde, agro, financeiro, varejo mid-market): +10
- Porte ideal (100-5000 funcionários): +10
 
Classificação: 70-100 = QUENTE, 40-69 = MORNO, 0-39 = FRIO
Se não encontrar sinais recentes concretos, score máximo é 25 (FRIO).
 
PASSO 3 — IDENTIFIQUE A PESSOA CERTA
- Novo CEO/Diretor → abordar ele diretamente
- Expansão/crescimento → CEO ou COO
- Vagas de RH → Head de RH ou Diretor de Pessoas
- Vagas de controladoria → CFO ou Diretor Financeiro
- Sem sinal específico → CEO ou Diretor Geral
 
PASSO 4 — GERE A MENSAGEM LINKEDIN
Estrutura obrigatória:
1. "E aí [Nome], tudo jóia? Vou bem direto ao ponto para respeitar nossos tempos."
2. Mencione o sinal concreto encontrado como gancho
3. "Meu objetivo é te mostrar o STRATWs One, focado no acompanhamento e melhoria contínua dos indicadores estratégicos, já consolidado em empresas como [social proof adaptado ao setor]."
4. "Topa participar de uma demonstração com o nosso comercial? Caso contrário, me avise que finalizo meus pontos de contato."

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
