// Dados FICTICIOS para apresentacao. Empresas, pessoas, CNPJs, e-mails (.example) e IPs (faixas de documentacao) sao inventados.
// Tudo recebe is_demo = true e sai com `npm run demo:clear`.
//   npm run seed:demo        (ou SEED_DEMO=true no primeiro boot)
const { query, tx, pool } = require("../db");
const { hashPassword, generatePassword } = require("../lib/password");
const { REGION_OF_UF } = require("../lib/geo");

// ---------------------------------------------------------------- utilidades
let seed = 20261027;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (list) => list[Math.floor(rnd() * list.length)];
const weighted = (entries) => { let r = rnd() * entries.reduce((s, [, w]) => s + w, 0); for (const [v, w] of entries) { r -= w; if (r <= 0) return v; } return entries[0][0]; };
const DAY = 86400000;
const ymd = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
const reais = (value) => Math.round(value * 100);
const slug = (text) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");

async function insert(client, table, row) {
  const keys = Object.keys(row);
  const { rows } = await client.query(
    `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")}) RETURNING id`,
    keys.map((k) => row[k])
  );
  return rows[0].id;
}

// ---------------------------------------------------------------- dados
const COMPANIES = [
  ["Padaria Pão Dourado", "Alimentação", "São Paulo", "SP", "ativo", 11],
  ["Clínica Vida Plena", "Saúde", "Belo Horizonte", "MG", "ativo", 31],
  ["Auto Peças Horizonte", "Varejo automotivo", "Curitiba", "PR", "ativo", 41],
  ["Construtora Alvorada", "Construção civil", "Goiânia", "GO", "ativo", 62],
  ["Escola Novo Saber", "Educação", "Salvador", "BA", "ativo", 71],
  ["Pet Shop Patas Felizes", "Pet", "Rio de Janeiro", "RJ", "ativo", 21],
  ["Studio Lume Fotografia", "Serviços criativos", "Porto Alegre", "RS", "ativo", 51],
  ["Transportadora Rota Sul", "Logística", "Florianópolis", "SC", "ativo", 48],
  ["Restaurante Sabor da Serra", "Gastronomia", "Caxias do Sul", "RS", "ativo", 54],
  ["Academia Pulse Fit", "Fitness", "Recife", "PE", "ativo", 81],
  ["Imobiliária Casa Nova", "Imobiliário", "Fortaleza", "CE", "ativo", 85],
  ["Cafeteria Grão Nobre", "Alimentação", "Brasília", "DF", "ativo", 61],
  ["Advocacia Moura & Reis", "Jurídico", "Manaus", "AM", "ativo", 92],
  ["Agro Verde Sementes", "Agronegócio", "Cuiabá", "MT", "ativo", 65],
  ["Floricultura Bela Flor", "Varejo", "Belém", "PA", "lead", 91]
];

// [empresa, nome, tipo, status, progresso, orcamento R$, inicio (dias), prazo (dias), entregue (dias), stack, manutencao R$/mes, url]
const PROJECTS = [
  [0, "Site institucional e cardápio", "site", "entregue", 100, 4800, -270, -240, -236, ["HTML", "CSS", "JavaScript"], 190, true],
  [0, "Sistema de encomendas", "sistema", "desenvolvimento", 65, 14500, -70, 18, null, ["Node.js", "PostgreSQL", "React"], 0],
  [1, "Portal do paciente", "sistema", "testes", 88, 28000, -150, 9, null, ["Node.js", "PostgreSQL", "Vue"], 0],
  [1, "Landing page de check-up", "landing", "entregue", 100, 2900, -120, -105, -103, ["HTML", "CSS", "JavaScript"], 0],
  [2, "Loja virtual de peças", "loja", "desenvolvimento", 45, 19800, -55, 40, null, ["Node.js", "PostgreSQL", "Stripe"], 0],
  [3, "Site institucional", "site", "entregue", 100, 6500, -330, -300, -296, ["Next.js", "Tailwind"], 250, true],
  [3, "Landing do lançamento Alvorada Park", "landing", "design", 30, 3800, -20, 25, null, ["Figma", "HTML", "CSS"], 0],
  [4, "Plataforma de matrículas", "sistema", "briefing", 10, 22000, -8, 75, null, ["Node.js", "PostgreSQL", "React"], 0],
  [5, "App de agendamento", "app", "desenvolvimento", 55, 17500, -90, -4, null, ["React Native", "Node.js"], 0],
  [5, "Site e blog", "site", "entregue", 100, 5200, -200, -170, -168, ["WordPress", "PHP"], 220, true],
  [6, "Portfólio online", "site", "entregue", 100, 3200, -240, -225, -222, ["HTML", "CSS", "JavaScript"], 150, false],
  [7, "Painel de rastreio de cargas", "sistema", "entregue", 100, 32000, -310, -180, -176, ["Node.js", "PostgreSQL", "Mapbox"], 680, true],
  [8, "Cardápio digital e reservas", "site", "testes", 92, 7900, -60, 6, null, ["Next.js", "PostgreSQL"], 0],
  [9, "Landing de planos", "landing", "entregue", 100, 2400, -140, -128, -127, ["HTML", "CSS", "JavaScript"], 0],
  [9, "Sistema de check-in", "sistema", "pausado", 40, 15800, -100, 30, null, ["Node.js", "PostgreSQL"], 0],
  [10, "Portal de imóveis", "site", "desenvolvimento", 70, 24000, -110, 21, null, ["Next.js", "PostgreSQL", "Mapbox"], 0],
  [11, "Loja virtual de cafés", "loja", "entregue", 100, 9800, -260, -215, -212, ["Node.js", "PostgreSQL", "Stripe"], 420, false],
  [12, "Site institucional", "site", "design", 50, 5600, -25, 22, null, ["Figma", "Next.js"], 0],
  [13, "Catálogo e orçamento online", "sistema", "briefing", 15, 12000, -5, 60, null, ["Node.js", "PostgreSQL"], 0]
];

const PEOPLE = ["Juliana Prado", "Ricardo Teixeira", "Fernanda Lopes", "Bruno Carvalho", "Patrícia Nogueira", "Diego Ramos", "Camila Freitas", "Henrique Dias", "Larissa Mendonça", "Otávio Brandão", "Renata Siqueira", "Thiago Barros"];
const LEADS = [
  ["Juliana Prado", "Studio Aurora Pilates", "chat", "proposta", 8500],
  ["Ricardo Teixeira", "RT Engenharia", "indicacao", "contato", 15000],
  ["Fernanda Lopes", "Doces da Fer", "instagram", "novo", 3200],
  ["Bruno Carvalho", "BC Contabilidade", "site", "proposta", 9800],
  ["Patrícia Nogueira", "Clínica Sorriso Pleno", "chat", "ganho", 12400],
  ["Diego Ramos", "Ramos Distribuidora", "indicacao", "contato", 26000],
  ["Camila Freitas", "Ateliê Camila Freitas", "instagram", "novo", 2800],
  ["Henrique Dias", "HD Barbearia", "site", "perdido", 3500],
  ["Larissa Mendonça", "Colégio Pequeno Príncipe", "chat", "proposta", 31000],
  ["Otávio Brandão", "Brandão Veículos", "indicacao", "ganho", 18500],
  ["Renata Siqueira", "Siqueira Odontologia", "site", "novo", 5400],
  ["Thiago Barros", "Barros Fitness Club", "instagram", "contato", 7200]
];

const TASKS = [
  ["Modelar tabelas de encomendas e clientes", 1, "done", "alta", -25],
  ["Telas de listagem e filtro de pedidos", 1, "doing", "alta", 6],
  ["Integração de impressão de etiquetas", 1, "todo", "media", 14],
  ["Correções do retorno de testes (prontuário)", 2, "doing", "alta", 3],
  ["Homologar fluxo de agendamento online", 2, "todo", "alta", 7],
  ["Catálogo: importar 1.200 produtos", 4, "doing", "media", 12],
  ["Checkout com Pix e cartão", 4, "todo", "alta", 24],
  ["Layout da landing em 3 resoluções", 6, "doing", "media", 8],
  ["Textos e imagens do empreendimento", 6, "todo", "baixa", 15],
  ["Levantamento de requisitos com a secretaria", 7, "doing", "alta", 5],
  ["Notificações push de lembrete", 8, "todo", "alta", -2],
  ["Publicar app nas lojas (revisão)", 8, "todo", "media", 10],
  ["Teste de carga das reservas", 12, "doing", "media", 4],
  ["Ajustar cardápio para impressão", 12, "done", "baixa", -3],
  ["Mapa interativo dos imóveis", 15, "doing", "alta", 9],
  ["Filtro por bairro e faixa de preço", 15, "todo", "media", 16],
  ["Wireframes das páginas internas", 17, "done", "media", -7],
  ["Aprovação do layout pelo cliente", 17, "doing", "alta", 5],
  ["Mapear regras de orçamento por cultura", 18, "todo", "media", 20],
  ["Renovar certificado SSL de 4 sites", null, "todo", "alta", 11],
  ["Backup mensal dos bancos dos clientes", null, "doing", "media", 2],
  ["Atualizar dependências do painel de rastreio", 11, "todo", "baixa", 30]
];

const REGION_UFS = [
  ["SP", 26], ["RJ", 9], ["MG", 8], ["ES", 2], ["PR", 6], ["SC", 5], ["RS", 7], ["BA", 6], ["PE", 4], ["CE", 4], ["MA", 1.3], ["PB", 1], ["RN", 1], ["AL", 0.7],
  ["DF", 4], ["GO", 3], ["MT", 1.5], ["MS", 1.5], ["PA", 2], ["AM", 1.5], ["TO", 0.5], ["RO", 0.5], ["AC", 0.2], ["AP", 0.1], ["RR", 0.1], ["PI", 0.6], ["SE", 0.5]
];
const CITIES = {
  SP: ["São Paulo", "São Paulo", "Campinas", "Santos", "Ribeirão Preto", "Guarulhos"], RJ: ["Rio de Janeiro", "Niterói", "Petrópolis"], MG: ["Belo Horizonte", "Uberlândia", "Juiz de Fora"],
  ES: ["Vitória", "Vila Velha"], PR: ["Curitiba", "Londrina", "Maringá"], SC: ["Florianópolis", "Joinville", "Blumenau"], RS: ["Porto Alegre", "Caxias do Sul", "Pelotas"],
  BA: ["Salvador", "Feira de Santana"], PE: ["Recife", "Olinda"], CE: ["Fortaleza", "Sobral"], DF: ["Brasília"], GO: ["Goiânia", "Anápolis"], MT: ["Cuiabá"], MS: ["Campo Grande"],
  PA: ["Belém"], AM: ["Manaus"], MA: ["São Luís"], PB: ["João Pessoa"], RN: ["Natal"], AL: ["Maceió"], TO: ["Palmas"], RO: ["Porto Velho"], AC: ["Rio Branco"], AP: ["Macapá"], RR: ["Boa Vista"], PI: ["Teresina"], SE: ["Aracaju"]
};

// ---------------------------------------------------------------- seed
async function seedDemo() {
  const demoPassword = generatePassword(16); // ninguem precisa saber: use "Redefinir senha" no painel para entrar como cliente demo
  const demoHash = await hashPassword(demoPassword);
  const adminId = (await query("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1")).rows[0]?.id || null;

  const counts = await tx(async (c) => {
    // ----- empresas
    const companyIds = [];
    for (const [i, [name, segment, city, state, status, ddd]] of COMPANIES.entries()) {
      const s = slug(name);
      companyIds.push(await insert(c, "companies", {
        name, segment, city, state, status, cnpj: `${String(10 + i).padStart(2, "0")}.000.000/0001-00`,
        email: `contato@${s}.example`, phone: `(${ddd}) 90000-${String(1000 + i * 37).slice(-4)}`,
        notes: i % 4 === 0 ? "Cliente indicado por outro cliente da carteira." : null, is_demo: true,
        created_at: ago(between(40, 340) * 1440)
      }));
    }

    // ----- usuarios demo (senhas aleatorias; so o hash fica no banco)
    const staffIds = [];
    for (const [name, email, role, status, company] of [
      ["Camila Duarte", "camila.duarte@buildhub.example", "staff", "active", null],
      ["Rafael Nunes", "rafael.nunes@buildhub.example", "staff", "active", null],
      ["Marcos Pereira", "marcos@paodourado.example", "client", "active", 0],
      ["Dra. Helena Cardoso", "helena@vidaplena.example", "client", "active", 1],
      ["Paulo Vieira", "paulo.vieira@rotasul.example", "client", "blocked", 7]
    ]) {
      const id = await insert(c, "users", {
        name, email, password_hash: demoHash, role, status, company_id: company === null ? null : companyIds[company],
        must_change_password: false, is_demo: true, last_login_at: status === "active" ? ago(between(60, 9000)) : null,
        last_login_country: status === "active" ? "BR" : null, created_at: ago(between(30, 200) * 1440)
      });
      if (role === "staff") staffIds.push(id);
    }

    // ----- projetos, sites, cobrancas
    const projectIds = [];
    const invoices = [];
    for (const [ci, name, type, status, progress, budget, start, due, delivered, stack, maint, featured] of PROJECTS) {
      const company = COMPANIES[ci];
      const id = await insert(c, "projects", {
        company_id: companyIds[ci], name, type, status, progress, budget_cents: reais(budget), start_date: ymd(start), due_date: ymd(due),
        delivered_at: delivered === null ? null : ymd(delivered), stack, is_demo: true,
        description: `${type === "loja" ? "Loja virtual" : type === "sistema" ? "Sistema web sob medida" : type === "app" ? "Aplicativo" : type === "landing" ? "Landing page" : "Site"} para ${company[0]}.`
      });
      projectIds.push(id);

      if (status === "entregue") {
        const slugName = slug(company[0]);
        const siteId = await insert(c, "portfolio_sites", {
          name, company_id: companyIds[ci], client_name: company[0], url: `https://www.${slugName}.example`,
          category: type === "loja" ? "ecommerce" : type === "landing" ? "landing" : type === "sistema" ? "sistema" : "institucional",
          tech: stack, delivered_on: ymd(delivered), status: name.includes("Site e blog") ? "manutencao" : "online",
          featured: !!featured, maintenance_cents: reais(maint), is_demo: true,
          notes: maint ? "Contrato de manutenção mensal ativo." : "Sem contrato de manutenção."
        });
        void siteId;
        invoices.push([ci, id, `${name} - entrada (50%)`, budget * 0.5, start + 4, "paga", start + between(5, 9)]);
        invoices.push([ci, id, `${name} - parcela final (50%)`, budget * 0.5, delivered + 5, "paga", delivered + between(3, 12)]);
        // manutencao mensal: ultimos 5 meses pagos + a do mes atual pendente
        if (maint) {
          for (let m = 5; m >= 1; m -= 1) invoices.push([ci, id, `Manutenção mensal - ${new Date(Date.now() - m * 30 * DAY).toLocaleDateString("pt-BR", { month: "long" })}`, maint, -m * 30 + 3, "paga", -m * 30 + between(3, 6)]);
          invoices.push([ci, id, "Manutenção mensal - mês atual", maint, between(3, 9), "pendente", null]);
        }
      } else if (status !== "pausado") {
        invoices.push([ci, id, `${name} - entrada (40%)`, budget * 0.4, start + 4, "paga", start + between(5, 9)]);
        if (progress >= 50) invoices.push([ci, id, `${name} - parcela 2 (30%)`, budget * 0.3, Math.round(start + (due - start) * 0.55), "paga", Math.round(start + (due - start) * 0.55) + between(0, 5)]);
        else invoices.push([ci, id, `${name} - parcela 2 (30%)`, budget * 0.3, Math.max(due - 30, 7), "pendente", null]);
        invoices.push([ci, id, `${name} - parcela final (30%)`, budget * 0.3, due + 5, "pendente", null]);
      } else {
        invoices.push([ci, id, `${name} - entrada (40%)`, budget * 0.4, start + 4, "paga", start + 8]);
      }
    }
    // servicos avulsos mais antigos (dao historico a curva de receita)
    for (const [ci, description, value, offset] of [
      [6, "Ajustes e otimização do portfólio", 1800, -335], [3, "Treinamento da equipe no painel do site", 2400, -318], [0, "Banners e artes para campanha", 1200, -290],
      [5, "Migração de hospedagem", 2900, -262], [1, "Consultoria de SEO local", 3300, -241], [11, "Auditoria de desempenho e segurança", 4500, -226],
      [9, "Ajustes no blog e novas páginas", 2100, -205], [8, "Identidade visual do cardápio", 1900, -188], [10, "Integração com sistema de pedidos", 3800, -164]
    ]) invoices.push([ci, null, description, value, offset, "paga", offset + between(2, 8)]);
    // cobrancas atrasadas (para demonstrar o controle de cobranca)
    invoices.push([5, projectIds[8], "App de agendamento - parcela 2 (30%)", 5250, -3, "pendente", null]);
    invoices.push([2, projectIds[4], "Loja virtual de peças - parcela 2 (30%)", 5940, -9, "pendente", null]);
    invoices.push([9, projectIds[14], "Sistema de check-in - parcela 2", 4740, -18, "pendente", null]);
    invoices.push([12, null, "Consultoria de SEO - pacote inicial", 1800, -47, "pendente", null]);
    invoices.push([5, projectIds[9], "Hospedagem anual (domínio e certificado)", 480, 12, "cancelada", null]);

    let invoiceCount = 0;
    for (const [ci, pid, description, value, dueOffset, status, paidOffset] of invoices) {
      const reminders = status === "pendente" && dueOffset < 0 ? Math.min(3, Math.ceil(-dueOffset / 12)) : 0;
      await c.query(
        `INSERT INTO invoices (number, company_id, project_id, description, amount_cents, issue_date, due_date, status, paid_at, payment_method, reminder_count, last_reminder_at, is_demo)
         VALUES ('BH-' || to_char($6::date, 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 4, '0'), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)`,
        [companyIds[ci], pid, description, reais(value), ymd(Math.min(dueOffset - 10, dueOffset)), ymd(dueOffset), status, paidOffset === null ? null : ymd(Math.min(paidOffset, 0)),
          status === "paga" ? pick(["pix", "pix", "pix", "boleto", "transferencia", "cartao"]) : null, reminders, reminders ? ago(between(1, 6) * 1440) : null]
      );
      invoiceCount += 1;
    }

    // ----- despesas (12 meses)
    let expenseCount = 0;
    const addExpense = async (category, description, value, offset, vendor, recurring) => {
      await insert(c, "expenses", { category, description, amount_cents: reais(value), spent_on: ymd(offset), vendor, recurring, is_demo: true });
      expenseCount += 1;
    };
    for (let m = 0; m < 12; m += 1) {
      const base = -m * 30;
      const growth = 1 + (11 - m) * 0.025;
      await addExpense("hospedagem", "Hospedagem dos projetos e bancos", Math.round(380 * growth), base - 2, "Railway", true);
      await addExpense("infraestrutura", "Domínios, CDN e certificados", 220, base - 5, "Cloudflare / Registro.br", true);
      await addExpense("ferramentas", "Figma, GitHub, Notion e Google Workspace", Math.round(640 * growth), base - 8, "Assinaturas", true);
      await addExpense("folha", "Pró-labore e equipe", Math.round(11800 * growth), base - 10, "Folha", true);
      await addExpense("marketing", "Anúncios e produção de conteúdo", between(700, 1400), base - 12, "Meta Ads / Google Ads", false);
      await addExpense("impostos", "Impostos do mês (Simples Nacional)", between(1500, 3300), base - 15, "Receita Federal", true);
      if (m % 2 === 0) await addExpense("freelancer", pick(["Ilustração e identidade visual", "Revisão de textos", "Desenvolvimento pontual"]), between(1500, 3600), base - 18, pick(["Freelancer", "Estúdio parceiro"]), false);
    }

    // ----- leads, tarefas
    for (const [name, company, source, status, value] of LEADS) {
      await insert(c, "leads", {
        name, company_name: company, email: `${slug(name)}@${slug(company)}.example`, source, status, value_cents: reais(value),
        notes: status === "perdido" ? "Optou por uma solução pronta." : null, is_demo: true, created_at: ago(between(1, 45) * 1440), updated_at: ago(between(0, 10) * 1440)
      });
    }
    for (const [title, projectIndex, status, priority, dueOffset] of TASKS) {
      await insert(c, "tasks", {
        title, project_id: projectIndex === null ? null : projectIds[projectIndex], status, priority, due_date: ymd(dueOffset),
        assignee_id: rnd() < 0.8 ? pick(staffIds) : null, is_demo: true
      });
    }

    // ----- chat (conversas de exemplo)
    const conv = async (row, messages) => {
      const id = await insert(c, "chat_conversations", { token_hash: `demo-${Math.random().toString(36).slice(2)}`, is_demo: true, ...row });
      for (const [sender, body, minutesAgo] of messages) {
        await c.query("INSERT INTO chat_messages (conversation_id, sender, admin_id, body, created_at) VALUES ($1,$2,$3,$4,$5)", [id, sender, sender === "admin" ? adminId : null, body, ago(minutesAgo)]);
      }
      return id;
    };
    const chatIds = [];
    chatIds.push(await conv(
      { visitor_name: "Juliana Prado", country: "BR", region_code: "SP", mode: "ai", unread_admin: 2, ai_replies: 2, last_message_at: ago(4), last_message_preview: "Qual o prazo para uma loja virtual com Pix?", created_at: ago(14) },
      [["visitor", "Oi! Vocês fazem loja virtual?", 14], ["ai", "Olá! Sim, desenvolvemos lojas virtuais sob medida. Me conta: o que você pretende vender e para quando precisa do site?", 13],
       ["visitor", "Vendo cosméticos artesanais, queria começar em dois meses", 9], ["ai", "Ótimo! Para estimar prazo e valor a equipe precisa entender o escopo (catálogo, pagamentos, entrega). Pode deixar seu nome e um e-mail ou WhatsApp para enviarmos uma proposta?", 8],
       ["visitor", "Qual o prazo para uma loja virtual com Pix?", 4]]
    ));
    chatIds.push(await conv(
      { visitor_name: "Ricardo Teixeira", visitor_email: "ricardo@rtengenharia.example", country: "BR", region_code: "MG", mode: "human", assigned_admin_id: adminId, unread_admin: 0, ai_replies: 1, last_message_at: ago(52), last_message_preview: "Combinado, envio a proposta ainda hoje.", created_at: ago(190) },
      [["visitor", "Preciso de um sistema para controlar obras e equipes", 190], ["ai", "Podemos desenvolver um sistema sob medida para isso. Posso chamar um atendente para detalhar o escopo com você?", 189], ["visitor", "Pode sim", 187],
       ["system", "Chamei um atendente da equipe. Ele pode entrar na conversa a qualquer momento; enquanto isso, continuo por aqui para ajudar.", 186], ["system", "Administrador, da equipe BuildHub, entrou na conversa.", 80],
       ["admin", "Oi, Ricardo! Aqui é da BuildHub. Quantas obras e pessoas vão usar o sistema ao mesmo tempo?", 79], ["visitor", "Umas 6 obras e 40 pessoas", 70], ["admin", "Perfeito. Combinado, envio a proposta ainda hoje.", 52]]
    ));
    chatIds.push(await conv(
      { visitor_name: "Patrícia Nogueira", country: "BR", region_code: "RJ", mode: "ai", handoff_requested: true, unread_admin: 1, ai_replies: 1, last_message_at: ago(11), last_message_preview: "Chamei um atendente da equipe.", created_at: ago(18) },
      [["visitor", "Já paguei a entrada mas o boleto continua aparecendo como aberto", 17], ["ai", "Entendo a preocupação. Vou chamar um atendente para verificar o pagamento com você.", 16],
       ["system", "Chamei um atendente da equipe. Ele pode entrar na conversa a qualquer momento; enquanto isso, continuo por aqui para ajudar.", 11]]
    ));
    chatIds.push(await conv(
      { visitor_name: "Visitante", country: "BR", region_code: "RS", mode: "ai", status: "closed", ai_replies: 1, unread_admin: 0, last_message_at: ago(2000), last_message_preview: "Atendimento encerrado. Obrigado pelo contato!", created_at: ago(2010), closed_at: ago(2000) },
      [["visitor", "Vocês fazem manutenção de site WordPress?", 2010], ["ai", "Fazemos sim! Para orçar, preciso saber quantos plugins e se há loja virtual. Pode contar um pouco do seu site?", 2009], ["system", "Atendimento encerrado. Obrigado pelo contato!", 2000]]
    ));

    // ----- notificacoes
    for (const [type, title, body, link, minutes, read] of [
      ["handoff", "Cliente pediu atendimento humano", "Patrícia Nogueira: a IA sugeriu chamar um atendente", `#/chat/${chatIds[2]}`, 11, false],
      ["chat_new", "Nova conversa no site", "Juliana Prado: Oi! Vocês fazem loja virtual?", `#/chat/${chatIds[0]}`, 14, false],
      ["invoice_overdue", "4 cobranças em atraso", "Há R$ 17.730,00 vencidos. Veja em Cobranças.", "#/cobrancas", 240, false],
      ["security", "IP bloqueado temporariamente", "203.0.113.0 foi banido por 30 min (login).", "#/seguranca", 600, true],
      ["user_new", "Novo cadastro de cliente", "Dra. Helena Cardoso criou uma conta.", "#/usuarios", 1500, true],
      ["chat_message", "Nova mensagem em conversa assumida", "Ricardo Teixeira respondeu.", `#/chat/${chatIds[1]}`, 3000, true]
    ]) {
      await c.query("INSERT INTO notifications (type, title, body, link, read_at, is_demo, created_at) VALUES ($1,$2,$3,$4,$5,true,$6)", [type, title, body, link, read ? ago(minutes - 5) : null, ago(minutes)]);
    }

    return { companies: companyIds.length, projects: projectIds.length, invoices: invoiceCount, expenses: expenseCount };
  });

  const views = await seedVisits();
  const events = await seedSecurityEvents();
  return { ...counts, visits: views, securityEvents: events };
}

// ~90 dias de visitas com crescimento, padrao semanal e distribuicao por regiao do Brasil
async function seedVisits() {
  const cols = { at: [], visitor: [], path: [], ref: [], country: [], region: [], city: [], device: [], browser: [] };
  const push = (at, visitor, region) => {
    const known = region !== null;
    cols.at.push(new Date(at).toISOString());
    cols.visitor.push(visitor);
    cols.path.push(weighted([["/", 78], ["/login.html", 22]]));
    cols.ref.push(weighted([[null, 36], ["google.com", 36], ["instagram.com", 21], ["linkedin.com", 4], ["whatsapp.com", 3]]));
    cols.country.push("BR");
    cols.region.push(region);
    cols.city.push(known ? pick(CITIES[region] || [null]) : null);
    cols.device.push(weighted([["mobile", 62], ["desktop", 33], ["tablet", 5]]));
    cols.browser.push(weighted([["Chrome", 62], ["Safari", 22], ["Edge", 6], ["Firefox", 5], ["Outro", 5]]));
  };

  const days = 90;
  for (let d = days - 1; d >= 0; d -= 1) {
    const dayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime() - d * DAY;
    const weekday = new Date(dayStart).getDay();
    const trend = 34 + ((days - d) / days) * 52;
    const week = weekday === 0 ? 0.62 : weekday === 6 ? 0.74 : weekday === 2 || weekday === 3 ? 1.12 : 1;
    const target = Math.round(trend * week * (0.85 + rnd() * 0.3));
    for (let i = 0; i < target; i += 1) {
      const hour = weighted([[8, 4], [9, 7], [10, 9], [11, 9], [12, 8], [13, 6], [14, 8], [15, 9], [16, 8], [17, 7], [18, 7], [19, 8], [20, 9], [21, 8], [22, 5], [23, 2], [1, 1], [3, 1], [6, 2]]);
      const at = dayStart + hour * 3600000 + between(0, 3599) * 1000;
      if (at > Date.now()) continue;
      const visitor = `demo${d}-${i}-${Math.floor(rnd() * 1e6)}`;
      const unknown = rnd() < 0.03;
      const region = unknown ? null : weighted(REGION_UFS);
      push(at, visitor, region);
      if (rnd() < 0.35) push(at + between(20, 400) * 1000, visitor, region);
    }
  }
  for (let i = 0; i < 4; i += 1) push(Date.now() - between(20, 170) * 1000, `demo-live-${i}`, weighted(REGION_UFS)); // "online agora"

  const batch = 1000;
  for (let i = 0; i < cols.at.length; i += batch) {
    const slice = (list) => list.slice(i, i + batch);
    await query(
      `INSERT INTO page_views (occurred_at, visitor, path, referrer, country, region_code, city, device, browser, is_demo)
       SELECT * FROM unnest($1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::bool[])`,
      [slice(cols.at), slice(cols.visitor), slice(cols.path), slice(cols.ref), slice(cols.country), slice(cols.region), slice(cols.city), slice(cols.device), slice(cols.browser), slice(cols.at).map(() => true)]
    );
  }
  return cols.at.length;
}

async function seedSecurityEvents() {
  const rows = [];
  const fakeIp = () => `${pick(["192.0.2", "198.51.100", "203.0.113"])}.0`;
  const countries = [["US", 38], ["CN", 18], ["RU", 14], ["DE", 8], ["IN", 7], ["NL", 5], ["VN", 4], ["FR", 3], ["SG", 3]];
  for (let d = 13; d >= 0; d -= 1) {
    for (let k = 0; k < 6; k += 1) {
      const country = weighted(countries);
      rows.push(["geo_block", country, fakeIp(), pick(["/", "/login.html", "/api/auth/login", "/admin/"]), null, between(8, 140) * (country === "US" || country === "CN" ? 3 : 1), ago(d * 1440 + between(10, 1300))]);
    }
    if (d % 2 === 0) rows.push(["rate_limit", "BR", fakeIp(), "/api/chat/message", "chat", between(3, 40), ago(d * 1440 + between(10, 1300))]);
    if (d % 3 === 0) rows.push(["login_failed", "BR", fakeIp(), "/api/auth/login", "senha incorreta", between(1, 6), ago(d * 1440 + between(10, 1300))]);
  }
  rows.push(["ip_ban", "BR", "203.0.113.0", null, "login", 1, ago(600)]);
  rows.push(["csrf_block", "BR", "198.51.100.0", "/api/admin/users", null, 2, ago(4300)]);
  rows.push(["login_locked", "BR", "192.0.2.0", "/api/auth/login", null, 1, ago(2700)]);
  for (const [type, country, ip, path, detail, count, at] of rows) {
    await query("INSERT INTO security_events (occurred_at, type, country, ip_masked, path, detail, count, is_demo) VALUES ($1,$2,$3,$4,$5,$6,$7,true)", [at, type, country, ip, path, detail, count]);
  }
  return rows.length;
}

async function seedDemoIfEmpty() {
  const { rows } = await query("SELECT count(*)::int AS n FROM companies WHERE is_demo");
  if (rows[0].n > 0) return;
  console.log("[demo] inserindo dados ficticios de apresentacao...");
  const result = await seedDemo();
  console.log("[demo] pronto:", JSON.stringify(result));
}

module.exports = { seedDemo, seedDemoIfEmpty };

if (require.main === module) {
  (async () => {
    const { rows } = await query("SELECT count(*)::int AS n FROM companies WHERE is_demo");
    if (rows[0].n > 0) { console.log("Dados de demonstracao ja existem. Rode `npm run demo:clear` antes para recriar."); }
    else { console.log("Inserindo dados ficticios..."); console.log(JSON.stringify(await seedDemo())); }
    await pool.end();
  })().catch((error) => { console.error(error); process.exit(1); });
}
