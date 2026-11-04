-- Endurecimento detetado pelo Security Advisor do Supabase: no Supabase real,
-- os papéis recebem EXECUTE por privilégios por omissão, por isso as funções
-- de trigger (e a de Broadcast, criada depois do revoke da migração 1) ficavam
-- executáveis. Funções de trigger nunca devem ser chamáveis por clientes.
revoke execute on function
  public.touch_updated_at(),
  public.handle_new_user(),
  public.protect_profile_columns(),
  public.protect_channel_columns(),
  public.validate_channel_member(),
  public.before_message_insert(),
  public.log_activity()
from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'broadcast_message_created') then
    execute 'revoke execute on function public.broadcast_message_created() from public, anon, authenticated';
  end if;
end;
$$;

-- anon não executa nenhuma função do esquema public (inclui futuras).
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from public;
