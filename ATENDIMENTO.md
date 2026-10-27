# Atendimento da BuildHub

O prompt completo usado em todas as chamadas fica em [server/prompts/atendimento.md](server/prompts/atendimento.md). Foi baseado no conteúdo de public/index.html: serviços, processo de cinco etapas, contatos oficiais e natureza fictícia do portfólio.

O servidor envia esse prompt como instructions em cada chamada Responses, com saída estruturada validada antes de publicar uma resposta. As orientações extras do painel complementam o prompt. Não é necessário copiar o prompt inteiro no campo de orientações extras.

O atendimento coleta o objetivo, público, escopo essencial, integrações, materiais, prazo desejado e um contato opcional. Investimento é opcional. Não calcula valores nem promete prazo de entrega. Pedido comercial ou humano é encaminhado mesmo sem briefing completo. Dúvidas gerais sobre o processo seguem na IA.

Pedidos explícitos de orçamento/preço, atendente ou assuntos de suporte são encaminhados por regras do servidor, mesmo com a API indisponível. Briefings confirmados e demais motivos também podem ser sinalizados pelo modelo. A transferência muda a conversa para modo humano, registra uma notificação com histórico/resumo e pausa a IA. O administrador usa **Assumir conversa**; **Devolver à IA** retoma o atendimento automático. O encaminhamento usa o painel interno: não envia WhatsApp ou e-mail.

Mensagens recebidas passam por redação defensiva de alguns padrões de credenciais antes de serem armazenadas/publicadas. Mensagens antigas e respostas da IA também são filtradas antes do envio ao modelo ou exibição. O filtro não detecta todo dado sensível. Prompt e filtros reduzem riscos; autenticação, autorização, limites de uso e revisão humana continuam necessários.

## Railway

No serviço do app, configure as variáveis (sem colocar valores secretos no Git):

- OPENAI_API_KEY: uma chave nova da sua conta/projeto OpenAI.
- OPENAI_MODEL=gpt-6-luna
- OPENAI_REASONING_EFFORT=none
- AI_MOCK=false
- DATABASE_URL e SESSION_SECRET conforme o README.

A URL pública do site não permite editar essas variáveis. O painel mostra se a variável está presente; isso não confirma que a chave funciona ou tem saldo/permissão. Revogue uma chave compartilhada em conversa e nunca cole a nova chave no chat.

Sem chave válida, com limite de uso/saldo ou permissão insuficientes, ou em caso de erro da API, o atendimento é encaminhado à equipe. O painel/logs recebem um diagnóstico curto sem a mensagem bruta da API: OPENAI_API_KEY_NOT_CONFIGURED, OPENAI_HTTP_401:invalid_api_key, OPENAI_HTTP_429:..., OPENAI_HTTP_404:... etc. Não exponha logs ou dados de usuários publicamente.

## Validar

Execute npm test. Os testes usam Postgres em memória (PGlite) e uma API simulada, sem gastar créditos nem acessar dados de produção. Eles cobrem a transferência persistida, ausência de respostas depois da pausa/tomada humana, ocultação de credenciais, validação de saída, erros da API e o endpoint público.

Depois de configurar a chave na Railway e concluir o deploy:
1. Em uma conversa nova, pergunte "Como funciona o processo?". A IA deve explicar as cinco etapas e continuar a descoberta.
2. Descreva um projeto; confira que as perguntas são graduais.
3. Peça um orçamento. A conversa deve aparecer no painel com notificação, histórico/resumo e IA pausada.
4. Assuma como admin e responda; o visitante deve receber a mensagem humana.
5. Use Devolver à IA somente quando quiser retomar a automação.

Conversas já encaminhadas ficam pausadas até devolução explícita à IA ou início de uma nova conversa.
