# BuildHub

Site da BuildHub + painel administrativo + chat de atendimento com IA (OpenAI), em um único serviço Node.js com banco Postgres.

- **Site público** (`public/`): home, login/cadastro, chat flutuante com IA e contagem anônima de visitas.
- **Painel admin** (`/admin/`): dashboard com visitas e mapa do Brasil, chat ao vivo (a IA para quando você assume), clientes, leads, projetos, tarefas, sites entregues, cobranças, financeiro, usuários, segurança e configurações da IA.
- **Área do cliente** (`/cliente/`): projetos e cobranças da empresa vinculada ao usuário.
- **Servidor** (`server/`): Express 5 + Postgres (`pg`), sessões em cookie httpOnly, rate limit, banimento automático e tempo real por SSE.

## Rodar no seu computador

```bash
npm install
npm run dev:db     # terminal 1: Postgres local de teste (PGlite), porta 15433
npm run dev        # terminal 2: servidor em http://localhost:3000
```

O `.env` local já aponta para esse banco. Com `SEED_DEMO=true` o primeiro boot insere os **dados fictícios** de apresentação. Para a IA responder de verdade, crie `.env.local` com `OPENAI_API_KEY=...` e retire `AI_MOCK=true` do `.env` (com `AI_MOCK` ligado as respostas são simuladas).

> `dev:db` é só para desenvolvimento e testes. Em produção use o Postgres da Railway.

## Deploy na Railway

1. Suba este repositório no GitHub e crie um projeto na Railway com **Deploy from GitHub repo**.
2. No mesmo projeto, adicione o plugin **PostgreSQL**.
3. No serviço do app, abra **Variables** e cadastre:

| Variável | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` (referência ao plugin) |
| `SESSION_SECRET` | texto aleatório com 32+ caracteres (`openssl rand -hex 32`) |
| `TRUST_PROXY` | `1` |
| `ADMIN_EMAIL` | email do administrador |
| `ADMIN_PASSWORD_HASH` | hash gerado por `npm run admin:create` (veja abaixo) |
| `OPENAI_API_KEY` | sua chave da OpenAI |
| `OPENAI_MODEL` | opcional, padrão `gpt-6-luna` |
| `SEED_DEMO` | `true` para inserir os dados fictícios de apresentação (depois mude para `false`) |

4. Em **Settings → Networking**, gere o domínio público. A Railway usa `/health` como healthcheck (`railway.json`).
5. Abra `https://seu-dominio/login.html` e entre com o admin.

As tabelas são criadas sozinhas no primeiro boot (`server/migrations`).

### Usuário administrador (senha de 16 caracteres, guardada só como hash)

```bash
ADMIN_EMAIL=voce@suaempresa.com npm run admin:create
```

O script gera uma senha aleatória de 16 caracteres e a grava **apenas** em `ADMIN-CREDENTIALS.local.txt` (ignorado pelo git; guarde num gerenciador de senhas e apague o arquivo). No `.env` ele grava só o **hash** (`scrypt`). Na Railway cadastre `ADMIN_EMAIL` e `ADMIN_PASSWORD_HASH`: a senha em texto nunca vai para o servidor. O admin é criado no primeiro boot, se ainda não existir nenhum. Depois disso, troque senhas pelo painel (**Usuários → Redefinir senha**).

Se `ADMIN_PASSWORD_HASH` não for definido, o servidor gera uma senha de 16 caracteres e a imprime **uma única vez** nos logs do primeiro boot, exigindo troca no primeiro login.

### Dados fictícios

`SEED_DEMO=true` (ou `npm run seed:demo`) cria 15 empresas fictícias, 19 projetos, ~100 cobranças, despesas de 12 meses, sites entregues, leads, tarefas, conversas de chat, ~6.800 visitas distribuídas pelas regiões do Brasil e eventos de segurança. Tudo é marcado como demonstração e some com `npm run demo:clear`. Os clientes demo não têm senha conhecida: para mostrar a área do cliente, use **Usuários → Redefinir senha**.

## Atendimento com IA

- O visitante conversa com a IA (Responses API da OpenAI, modelo configurável em `OPENAI_MODEL`).
- Se ele pedir um atendente, ou a IA julgar necessário, o painel recebe uma **notificação** (sino, toast e som opcional).
- **Assumir conversa** (ou simplesmente responder) pausa a IA nessa conversa; **Devolver à IA** reativa.
- Em **Atendimento e IA** você liga/desliga a IA, edita a saudação e adiciona orientações extras ao prompt.
- A chave fica só no servidor. Limites: 1.000 caracteres por mensagem, 14 mensagens/min e 8 conversas novas/hora por IP, 40 respostas de IA por conversa.

## Segurança: o que existe e o que não existe

Implementado nesta aplicação:

- **Rate limit** por IP (geral, login, cadastro, chat, rastreio) e **banimento automático** de 30 min após 10 infrações em 10 min.
- **Login**: senhas com scrypt, conta travada 15 min após 5 erros, resposta de tempo uniforme, sessão em cookie `httpOnly` + `SameSite=Strict` (+ `__Host-` e `Secure` em produção), token CSRF e checagem de origem em toda alteração.
- **Cabeçalhos**: CSP restritiva (sem scripts inline), HSTS, nosniff, anti-clickjacking, referrer controlado.
- **Dados**: entradas validadas (zod), SQL parametrizado, saída escapada no painel (XSS), corpo limitado a 20 KB, limite de conexões em tempo real por IP.
- **Privacidade (LGPD)**: IP nunca é gravado inteiro (só mascarado/hash), CPF vira hash + últimos 4 dígitos, visitas usam hash diário. Trilha de auditoria das ações do painel.

Limites que você precisa conhecer:

- **DDoS volumétrico (ataque de rede) não se resolve dentro do app.** Esta camada protege a aplicação (excesso de requisições, força bruta, robôs). Para ataques grandes, coloque o **Cloudflare** (plano grátis) na frente do domínio, com regra de país e modo "Under Attack" quando necessário; nesse caso use `TRUST_PROXY=2` e `TRUST_CLOUDFLARE=true`.
- **O geo-bloqueio usa base GeoIP local** (precisão alta para país, menor para estado/cidade) e **não impede VPN/proxy** brasileiros. Também bloqueia robôs de busca estrangeiros (ex.: Googlebot) e monitores externos, o que pode afetar SEO.
- Confira em **Painel → Segurança** se o país/IP que o servidor enxerga para você está correto; se mostrar o IP da Railway, ajuste `TRUST_PROXY`.
- O rate limit e o banimento ficam em memória: rodando mais de uma instância, cada uma tem o seu.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm start` | servidor em produção |
| `npm run dev` | servidor com reinício automático |
| `npm run dev:db` | Postgres local de teste (PGlite) |
| `npm run admin:create` | gera credenciais do admin (senha de 16 caracteres + hash) |
| `npm run seed:demo` / `npm run demo:clear` | insere / remove os dados fictícios |
| `node server/scripts/gen-map.js` | regenera o mapa do Brasil a partir da malha do IBGE |

## Estrutura

```
public/          site público (index, login) + chat-widget + /admin + /cliente + /panel (UI compartilhada)
server/index.js  app Express e ordem dos middlewares
server/routes/   auth, público (chat/visitas), admin/*, cliente
server/lib/      senha, geo, chat, IA, SSE, eventos de segurança, auditoria
server/migrations/  schema do Postgres
server/scripts/  seed, admin, mapa, banco local
```

## Localizacao dos acessos

O acesso e permitido de qualquer pais, inclusive quando a localizacao do IP e desconhecida. A geolocalizacao continua disponivel para estatisticas. Rate limits, bloqueio temporario por abuso e protecoes de login continuam ativos. Na Railway, o IP do visitante usa X-Real-IP quando o ambiente da plataforma e detectado e TRUST_PROXY e maior que zero.
