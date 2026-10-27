-- BuildHub: schema inicial. Valores em centavos (bigint). Datas com fuso (timestamptz).

CREATE TABLE IF NOT EXISTS companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  cnpj        text,
  email       text,
  phone       text,
  city        text,
  state       char(2),
  segment     text,
  status      text NOT NULL DEFAULT 'ativo' CHECK (status IN ('lead','ativo','inativo')),
  notes       text,
  is_demo     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  email                text NOT NULL,
  password_hash        text NOT NULL,
  role                 text NOT NULL CHECK (role IN ('admin','staff','client')),
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  company_id           uuid REFERENCES companies(id) ON DELETE SET NULL,
  cpf_hash             text,
  cpf_last4            text,
  failed_attempts      int NOT NULL DEFAULT 0,
  locked_until         timestamptz,
  last_login_at        timestamptz,
  last_login_country   text,
  must_change_password boolean NOT NULL DEFAULT false,
  is_demo              boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_cpf_key ON users (cpf_hash) WHERE cpf_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  csrf         text NOT NULL,
  ip_masked    text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name         text NOT NULL,
  type         text NOT NULL DEFAULT 'site' CHECK (type IN ('site','sistema','landing','loja','app','manutencao')),
  status       text NOT NULL DEFAULT 'briefing' CHECK (status IN ('briefing','design','desenvolvimento','testes','entregue','pausado','cancelado')),
  progress     int NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  budget_cents bigint NOT NULL DEFAULT 0,
  start_date   date,
  due_date     date,
  delivered_at date,
  url          text,
  stack        text[] NOT NULL DEFAULT '{}',
  description  text,
  is_demo      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_company_idx ON projects (company_id);
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects (status);

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

CREATE TABLE IF NOT EXISTS invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number           text NOT NULL UNIQUE,
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  project_id       uuid REFERENCES projects(id) ON DELETE SET NULL,
  description      text NOT NULL,
  amount_cents     bigint NOT NULL CHECK (amount_cents > 0),
  issue_date       date NOT NULL DEFAULT current_date,
  due_date         date NOT NULL,
  status           text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','paga','cancelada')),
  paid_at          date,
  payment_method   text CHECK (payment_method IN ('pix','boleto','cartao','transferencia')),
  reminder_count   int NOT NULL DEFAULT 0,
  last_reminder_at timestamptz,
  notes            text,
  is_demo          boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_company_idx ON invoices (company_id);
CREATE INDEX IF NOT EXISTS invoices_status_due_idx ON invoices (status, due_date);
CREATE INDEX IF NOT EXISTS invoices_paid_idx ON invoices (paid_at);

CREATE TABLE IF NOT EXISTS expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category     text NOT NULL CHECK (category IN ('hospedagem','ferramentas','folha','marketing','impostos','infraestrutura','freelancer','outros')),
  description  text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  spent_on     date NOT NULL DEFAULT current_date,
  vendor       text,
  recurring    boolean NOT NULL DEFAULT false,
  is_demo      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_spent_idx ON expenses (spent_on);

CREATE TABLE IF NOT EXISTS portfolio_sites (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  company_id        uuid REFERENCES companies(id) ON DELETE SET NULL,
  client_name       text,
  url               text,
  category          text NOT NULL DEFAULT 'institucional' CHECK (category IN ('institucional','ecommerce','landing','sistema','app')),
  tech              text[] NOT NULL DEFAULT '{}',
  delivered_on      date,
  status            text NOT NULL DEFAULT 'online' CHECK (status IN ('online','manutencao','offline')),
  featured          boolean NOT NULL DEFAULT false,
  maintenance_cents bigint NOT NULL DEFAULT 0,
  notes             text,
  is_demo           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  email           text,
  phone           text,
  company_name    text,
  source          text NOT NULL DEFAULT 'site' CHECK (source IN ('chat','site','indicacao','instagram','outro')),
  status          text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','contato','proposta','ganho','perdido')),
  value_cents     bigint NOT NULL DEFAULT 0,
  notes           text,
  conversation_id uuid,
  is_demo         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  priority    text NOT NULL DEFAULT 'media' CHECK (priority IN ('baixa','media','alta')),
  due_date    date,
  assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  is_demo     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash           text NOT NULL,
  visitor_name         text,
  visitor_email        text,
  country              text,
  region_code          text,
  mode                 text NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai','human')),
  status               text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  handoff_requested    boolean NOT NULL DEFAULT false,
  assigned_admin_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  unread_admin         int NOT NULL DEFAULT 0,
  ai_replies           int NOT NULL DEFAULT 0,
  last_message_at      timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  ip_hash              text,
  is_demo              boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  closed_at            timestamptz
);
CREATE INDEX IF NOT EXISTS chat_conv_last_idx ON chat_conversations (status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id              bigserial PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender          text NOT NULL CHECK (sender IN ('visitor','ai','admin','system')),
  admin_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_msg_conv_idx ON chat_messages (conversation_id, id);

CREATE TABLE IF NOT EXISTS notifications (
  id         bigserial PRIMARY KEY,
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  link       text,
  data       jsonb,
  read_at    timestamptz,
  is_demo    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications (created_at DESC);

CREATE TABLE IF NOT EXISTS page_views (
  id          bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  visitor     text NOT NULL,
  path        text NOT NULL,
  referrer    text,
  country     text,
  region_code text,
  city        text,
  device      text,
  browser     text,
  is_demo     boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS page_views_time_idx ON page_views (occurred_at);
CREATE INDEX IF NOT EXISTS page_views_region_idx ON page_views (region_code);

CREATE TABLE IF NOT EXISTS security_events (
  id          bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  type        text NOT NULL,
  country     text,
  ip_masked   text,
  path        text,
  detail      text,
  count       int NOT NULL DEFAULT 1,
  is_demo     boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS security_events_time_idx ON security_events (occurred_at);
CREATE INDEX IF NOT EXISTS security_events_type_idx ON security_events (type, occurred_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id     uuid,
  user_email  text,
  action      text NOT NULL,
  entity      text,
  entity_id   text,
  detail      jsonb,
  ip_masked   text
);
CREATE INDEX IF NOT EXISTS audit_time_idx ON audit_log (occurred_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
