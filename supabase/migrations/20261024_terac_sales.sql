-- Apply once to existing Sidewalk installations. Fresh installs use schema.sql.
begin;
alter table businesses add column phone text, add column phone_source text;
alter table opportunities add column estimated_sales_cost numeric;
alter table emails add column subject text, add column body text, add column error text;
update runs set params=params || jsonb_build_object('maxSalesTasks',coalesce(params->'maxRealEmails','0'::jsonb));
create table sales_tasks(
 id uuid primary key default gen_random_uuid(),run_id uuid not null references runs,
 business_id uuid unique not null references businesses,brief jsonb not null,
 status text not null default 'QUEUED' check(status in ('QUEUED','CREATING','DRAFT','LAUNCHING','RECRUITING','REPORTED','APPROVING','COMPLETED','NEEDS_REVIEW')),
 terac_opportunity_id text unique,provider_status text,max_cost_usd numeric not null check(max_cost_usd>0),
 quoted_cost_usd numeric,report jsonb,error text,
 next_poll_at timestamptz not null default now(),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table sales_suppressions(phone text primary key,created_at timestamptz not null default now());
alter table sales_tasks enable row level security;
alter table sales_suppressions enable row level security;
commit;
