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

  const prompt = `Você é analista de vendas B2B da Siteware (STRATWs One — KPIs, metas, planos de ação, avaliação de desempenho, remuneração variável). Clientes: Vale, TV Globo, VLI, Unimed, Samarco, Centauro.

Empresa: ${companyGuess}
LinkedIn: ${linkedin_url}

PESQUISE (máx 2 buscas, foco nos últimos 90 dias):
- Novo C-Level assumindo cargo
- Vagas abertas de gestão/RH/controladoria
- Expansão, funding ou acquisition recente
- Crescimento acelerado ou reestruturação
- Porte e setor da empresa

SCORE (some apenas sinais dos últimos 90 dias):
- Novo C-Level nos últimos 90 dias: +30
- Expansão ativa ou funding: +20
- Vagas de gestão/RH abertas: +15
- Crescimento acelerado: +15
- Setor com fit (indústria, saúde, agro, financeiro, varejo): +10
- Porte ideal 100-5000 funcionários: +10
Sem sinais recentes = score máximo 25. 70+ = QUENTE, 40-69 = MORNO, abaixo = FRIO.

PESSOA CERTA:
- Novo CEO/Diretor → abordar ele
- Expansão → CEO ou COO
- Vagas RH → Head de RH
- Vagas controladoria → CFO
- Sem sinal → CEO ou Diretor Geral

MENSAGEM LINKEDIN — siga exatamente:
1. "E aí [Nome], tudo jóia? Vou bem direto ao ponto para respeitar nossos tempos."
2. Mencione o sinal concreto como gancho (ex: "Vi que vocês acabaram de expandir para..." ou "Vi que vocês estão passando por...")
3. SE o sinal for de CRESCIMENTO ou EXPANSÃO, use:
"Tendo em vista esse momento, acredito ser interessante te apresentar o STRATWs One, que pode ajudar a dar visibilidade dos indicadores estratégicos, onde estão as oportunidades e gargalos, para garantir que a energia seja empregada na direção certa e direcionar ainda mais o crescimento. Já faz isso em empresas como [social proof por setor]."
SE o sinal for de DESAFIO, REESTRUTURAÇÃO, AUDITORIA ou PROBLEMA:
"Com esses desafios, o STRATWs One pode ajudar a dar visibilidade e governança na gestão dos indicadores estratégicos, onde estão as oportunidades e gargalos, para garantir melhora nos resultados. Já atendemos empresas como [social proof por setor]."
SE não houver sinal claro, use a versão de crescimento de forma genérica.
4. "Topa conhecer mais? Caso contrário, me avise que finalizo meus pontos de contato."

Social proof por setor: indústria/manufatura → Vale, VLI, Samarco | saúde → Unimed | varejo/consumo → Centauro, TV Globo | genérico → Vale, TV Globo, Unimed

Responda SOMENTE JSON válido, sem texto fora:
{
  "empresa": "nome real",
  "setor": "setor",
  "porte": "startup | PME | mid-market | enterprise",
  "score": 0,
  "score_label": "QUENTE | MORNO | FRIO",
  "score_breakdown": "Sinal (+pts) + Sinal (+pts) = total",
  "tipo_sinal": "crescimento | desafio | neutro",
  "sinais": [
    {
      "tipo": "QUENTE | MORNO | FRIO",
      "titulo": "titulo curto",
      "descricao": "descrição com data/fonte",
      "impacto": "por que indica momento de compra"
    }
  ],
  "pessoas_chave": [
    {
      "nome": "nome ou Identificar via Sales Navigator",
      "cargo": "cargo",
      "por_que_abordar": "motivo ligado ao sinal"
    }
  ],
  "contexto": "2-3 frases sobre o momento atual",
  "mensagem_linkedin": "mensagem completa seguindo estrutura acima",
  "recomendacao": "módulo STRATWs mais relevante e como conectar"
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
        model: "claude-haiku-4-5-20251001",
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
    console.log(`OK: ${parsed.empresa} | score: ${parsed.score} | ${parsed.score_label}`);
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
