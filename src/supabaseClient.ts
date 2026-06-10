import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'MY_SUPABASE_URL' && 
  supabaseAnonKey !== 'MY_SUPABASE_KEY'
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Clean types matching the state in App.tsx
export interface DbRobot {
  id?: number;
  name: string;
  platform: string;
  status: 'Ativo' | 'Pausado';
  last_run?: string;
  next_run?: string;
  performance?: string;
  processed?: number;
  type?: string;
  icon?: string;
  text_color?: string;
  user_id?: string;
}

export interface DbPost {
  id: number;
  title: string;
  platform: string;
  status: 'Sucesso' | 'Falhou' | 'Em processamento';
  time: string;
  image: string;
  price?: string;
  location?: string;
  user_id?: string;
}

export interface DbClient {
  id: number;
  name: string;
  phone: string;
  email: string;
  source: string;
  user_id?: string;
}

export interface DbLead {
  id: number;
  client_name: string;
  interest: string;
  status: 'Quente' | 'Morno' | 'Frio';
  date: string;
  user_id?: string;
}

export interface DbJob {
  id?: string;
  task_type: string;
  company_id: string;
  priority: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  retries: number;
  max_retries: number;
  created_at: string;
  error_msg?: string | null;
  user_id?: string;
}

export interface DbLog {
  id?: string;
  timestamp: string;
  level: string;
  message: string;
  robot_name: string;
  responsible_user: string;
  user_id?: string;
}

export interface DbNotification {
  id?: string;
  type: string;
  title: string;
  message: string;
  time: string;
  user_id?: string;
}

export interface DbIntegration {
  id?: number;
  user_id?: string;
  plataforma: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  status: 'Conectado' | 'Desconectado' | 'Token Expirado' | 'Erro de Autorização';
  ultima_sincronizacao?: string;
  created_at?: string;
  updated_at?: string;
  profile_name?: string; // Optional: name of the connected account
}

export interface DbLead {
  id: number;
  client_name: string;
  interest: string;
  status: 'Quente' | 'Morno' | 'Frio';
  date: string;
  user_id?: string;
}

// SQL helper query for easy setup copy-paste
export const SUPABASE_SQL_CREATION_SCRIPT = `-- SCRIPT DE MIGRAÇÃO COMPLETO COM PERFIL, LIGAÇÕES E RLS ATIVOS
-- Execute este script no editor SQL do Supabase (SQL Editor -> New Query)

-- 1. Criar a tabela de Perfis do utilizador (profiles)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text,
  agency_name text,
  plan text default 'Plano profissional',
  credits_used integer default 0,
  phone text,
  address text
);

-- Garantir que as colunas existem na tabela de perfis
alter table if exists public.profiles add column if not exists phone text;
alter table if exists public.profiles add column if not exists address text;

-- Ativar RLS para Perfis
alter table public.profiles enable row level security;

-- Criar políticas para Perfis
drop policy if exists "Permitir leitura ao próprio dono" on public.profiles;
create policy "Permitir leitura ao próprio dono" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Permitir atualização ao próprio dono" on public.profiles;
create policy "Permitir atualização ao próprio dono" on public.profiles
  for update using (auth.uid() = id);

-- 2. Trigger automático para criar o Perfil após o registo (Sign Up) do utilizador
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, agency_name, plan, credits_used)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'Imobiliária ' || coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'Plano profissional',
    0
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger para executar a função
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. Cria as outras tabelas com ligações corretas (caso não existam de todo)
create table if not exists public.robots (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  platform text not null,
  icon text not null,
  "textColor" text not null,
  status text not null,
  "nextRun" text not null,
  "lastRun" text not null
);

create table if not exists public.posts (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  platform text not null,
  status text not null,
  time text not null,
  image text not null,
  price text,
  location text
);

create table if not exists public.clients (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  phone text,
  email text,
  source text not null
);

create table if not exists public.leads (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  "clientName" text not null,
  interest text not null,
  status text not null,
  date text not null
);

create table if not exists public.jobs (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  "taskType" text not null,
  "companyId" text not null,
  priority text not null,
  status text not null,
  retries integer default 0,
  "maxRetries" integer default 3,
  "createdAt" text not null,
  "errorMsg" text
);

create table if not exists public.logs (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  timestamp text not null,
  level text not null,
  message text not null,
  "robotName" text not null,
  "responsibleUser" text not null
);

create table if not exists public.notifications (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  type text not null,
  title text not null,
  message text not null,
  time text not null
);

create table if not exists public.integrations (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  plataforma text not null,
  access_token text,
  refresh_token text,
  expires_at timestamp with time zone,
  status text not null default 'Desconectado',
  ultima_sincronizacao timestamp with time zone,
  profile_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Garantir que a coluna user_id existe se as tabelas já existiam
alter table if exists public.robots add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table if exists public.posts add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table if exists public.clients add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table if exists public.leads add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table if exists public.jobs add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table if exists public.logs add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table if exists public.notifications add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table if exists public.integrations add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();

-- Atualizar registos antigos órfãos com o utilizador atual, se houver
update public.robots set user_id = auth.uid() where user_id is null;
update public.posts set user_id = auth.uid() where user_id is null;
update public.clients set user_id = auth.uid() where user_id is null;
update public.leads set user_id = auth.uid() where user_id is null;
update public.jobs set user_id = auth.uid() where user_id is null;
update public.logs set user_id = auth.uid() where user_id is null;
update public.notifications set user_id = auth.uid() where user_id is null;
update public.integrations set user_id = auth.uid() where user_id is null;

-- 4. Ativar segurança de nível de linha (Row Level Security - RLS)
alter table public.robots enable row level security;
alter table public.posts enable row level security;
alter table public.clients enable row level security;
alter table public.leads enable row level security;
alter table public.jobs enable row level security;
alter table public.logs enable row level security;
alter table public.notifications enable row level security;
alter table public.integrations enable row level security;

-- 5. Eliminar políticas antigas antes de recriar para evitar erros de duplicação
drop policy if exists "Utilizadores autenticados podem ver os seus robôs" on public.robots;
drop policy if exists "Utilizadores autenticados podem inserir os seus robôs" on public.robots;
drop policy if exists "Utilizadores autenticados podem atualizar os seus robôs" on public.robots;
drop policy if exists "Utilizadores autenticados podem eliminar os seus robôs" on public.robots;

drop policy if exists "Utilizadores autenticados podem ver os seus posts" on public.posts;
drop policy if exists "Utilizadores autenticados podem inserir os seus posts" on public.posts;
drop policy if exists "Utilizadores autenticados podem atualizar os seus posts" on public.posts;
drop policy if exists "Utilizadores autenticados podem eliminar os seus posts" on public.posts;

drop policy if exists "Utilizadores autenticados podem ver os seus clientes" on public.clients;
drop policy if exists "Utilizadores autenticados podem inserir os seus clientes" on public.clients;
drop policy if exists "Utilizadores autenticados podem atualizar os seus clientes" on public.clients;
drop policy if exists "Utilizadores autenticados podem eliminar os seus clientes" on public.clients;

drop policy if exists "Utilizadores autenticados podem ver os seus leads" on public.leads;
drop policy if exists "Utilizadores autenticados podem inserir os seus leads" on public.leads;
drop policy if exists "Utilizadores autenticados podem atualizar os seus leads" on public.leads;
drop policy if exists "Utilizadores autenticados podem eliminar os seus leads" on public.leads;

drop policy if exists "Utilizadores autenticados podem ver os seus jobs" on public.jobs;
drop policy if exists "Utilizadores autenticados podem ocupar os seus jobs" on public.jobs;
drop policy if exists "Utilizadores autenticados podem ver os seus logs" on public.logs;
drop policy if exists "Utilizadores autenticados podem ver as suas notificações" on public.notifications;
drop policy if exists "Utilizadores autenticados podem ver as suas integrações" on public.integrations;

-- 6. Criar as políticas de Row Level Security (RLS) seguras baseadas no user_id (CRUD Completo)
-- Robôs
create policy "Utilizadores autenticados podem ver os seus robôs" on public.robots for select using (auth.uid() = user_id);
create policy "Utilizadores autenticados podem inserir os seus robôs" on public.robots for insert with check (auth.uid() = user_id);
create policy "Utilizadores autenticados podem atualizar os seus robôs" on public.robots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Utilizadores autenticados podem eliminar os seus robôs" on public.robots for delete using (auth.uid() = user_id);

-- Posts
create policy "Utilizadores autenticados podem ver os seus posts" on public.posts for select using (auth.uid() = user_id);
create policy "Utilizadores autenticados podem inserir os seus posts" on public.posts for insert with check (auth.uid() = user_id);
create policy "Utilizadores autenticados podem atualizar os seus posts" on public.posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Utilizadores autenticados podem eliminar os seus posts" on public.posts for delete using (auth.uid() = user_id);

-- Clientes
create policy "Utilizadores autenticados podem ver os seus clientes" on public.clients for select using (auth.uid() = user_id);
create policy "Utilizadores autenticados podem inserir os seus clientes" on public.clients for insert with check (auth.uid() = user_id);
create policy "Utilizadores autenticados podem atualizar os seus clientes" on public.clients for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Utilizadores autenticados podem eliminar os seus clientes" on public.clients for delete using (auth.uid() = user_id);

-- Leads
create policy "Utilizadores autenticados podem ver os seus leads" on public.leads for select using (auth.uid() = user_id);
create policy "Utilizadores autenticados podem inserir os seus leads" on public.leads for insert with check (auth.uid() = user_id);
create policy "Utilizadores autenticados podem atualizar os seus leads" on public.leads for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Utilizadores autenticados podem eliminar os seus leads" on public.leads for delete using (auth.uid() = user_id);

-- Jobs
create policy "Utilizadores autenticados podem ver os seus jobs" on public.jobs for select using (auth.uid() = user_id);
create policy "Utilizadores autenticados podem ocupar os seus jobs" on public.jobs for all using (auth.uid() = user_id);

-- Logs
create policy "Utilizadores autenticados podem ver os seus logs" on public.logs for all using (auth.uid() = user_id);

-- Notifications
create policy "Utilizadores autenticados podem ver as suas notificações" on public.notifications for all using (auth.uid() = user_id);

-- Integrations
create policy "Utilizadores autenticados podem ver as suas integrações" on public.integrations for all using (auth.uid() = user_id);
`;

// Helper load / save functions with structured error feedback and user filtering
export async function saveLogToSupabase(log: DbLog, userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('logs')
    .insert({ ...log, user_id: userId });
  return !error;
}

export async function getRobotsFromSupabase(userId: string): Promise<DbRobot[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('robots')
    .select('*')
    .eq('user_id', userId)
    .order('id', { ascending: true });
  if (error) {
    console.warn('Erro ao carregar robôs do Supabase:', error.message);
    return null;
  }
  return data as DbRobot[];
}

export async function getJobsFromSupabase(userId: string): Promise<DbJob[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return null;
  return data as DbJob[];
}

export async function saveJobToSupabase(job: DbJob, userId: string): Promise<DbJob | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('jobs')
    .insert({ ...job, user_id: userId })
    .select()
    .single();
  if (error) {
    console.warn('Erro ao inserir job no Supabase:', error.message);
    return null;
  }
  return data as DbJob;
}

export async function getLogsFromSupabase(userId: string): Promise<DbLog[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('logs')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(50);
  if (error) return null;
  return data as DbLog[];
}

export async function getNotificationsFromSupabase(userId: string): Promise<DbNotification[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('time', { ascending: false });
  if (error) return null;
  return data as DbNotification[];
}

export async function getIntegrationsFromSupabase(userId: string): Promise<DbIntegration[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId);
  if (error) return null;
  return data as DbIntegration[];
}

export async function saveIntegrationToSupabase(integration: DbIntegration, userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('integrations')
    .upsert({ ...integration, user_id: userId });
  return !error;
}

export async function deleteIntegrationFromSupabase(id: number, userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('integrations')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  return !error;
}

export async function saveRobotToSupabase(robot: DbRobot, userId: string): Promise<boolean> {
  if (!supabase) return false;
  
  if (robot.id) {
    const { error } = await supabase
      .from('robots')
      .upsert({ ...robot, user_id: userId });
    return !error;
  } else {
    // Insert if no ID
    const { error } = await supabase.from('robots').insert({
      ...robot,
      user_id: userId
    });
    return !error;
  }
}

export async function getPostsFromSupabase(userId: string): Promise<DbPost[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', userId)
    .order('id', { ascending: false });
  if (error) {
    console.warn('Erro ao carregar posts do Supabase:', error.message);
    return null;
  }
  return data as DbPost[];
}

export async function insertPostToSupabase(post: Omit<DbPost, 'id' | 'user_id'>, userId: string): Promise<DbPost | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('posts')
    .insert({ ...post, user_id: userId })
    .select()
    .single();
  if (error) {
    console.warn('Erro ao inserir post no Supabase:', error.message);
    return null;
  }
  return data as DbPost;
}

export async function getClientsFromSupabase(userId: string): Promise<DbClient[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('user_id', userId)
    .order('id', { ascending: false });
  if (error) {
    console.warn('Erro ao carregar clientes do Supabase:', error.message);
    return null;
  }
  return data as DbClient[];
}

export async function insertClientToSupabase(client: Omit<DbClient, 'id' | 'user_id'>, userId: string): Promise<DbClient | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('clients')
    .insert({ ...client, user_id: userId })
    .select()
    .single();
  if (error) {
    console.warn('Erro ao inserir cliente no Supabase:', error.message);
    return null;
  }
  return data as DbClient;
}

export async function getLeadsFromSupabase(userId: string): Promise<DbLead[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('user_id', userId)
    .order('id', { ascending: false });
  if (error) {
    console.warn('Erro ao carregar leads do Supabase:', error.message);
    return null;
  }
  return data as DbLead[];
}

export async function insertLeadToSupabase(lead: Omit<DbLead, 'id' | 'user_id'>, userId: string): Promise<DbLead | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('leads')
    .insert({ ...lead, user_id: userId })
    .select()
    .single();
  if (error) {
    console.warn('Erro ao inserir lead no Supabase:', error.message);
    return null;
  }
  return data as DbLead;
}

export interface DbProfile {
  id: string;
  name: string;
  agency_name: string;
  plan: string;
  credits_used: number;
  phone?: string;
  address?: string;
}

export async function getProfileFromSupabase(userId: string): Promise<DbProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('Erro ao carregar perfil do Supabase:', error.message);
    return null;
  }
  return data as DbProfile;
}

export async function saveProfileToSupabase(profile: Partial<DbProfile> & { id: string }): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('profiles')
    .upsert({
      ...profile,
      updated_at: new Date().toISOString()
    });
  if (error) {
    console.warn('Erro ao gravar perfil no Supabase:', error.message);
    return false;
  }
  return true;
}

