import { supabase } from '@/lib/supabase';

type AuditLogInput = {
  action: string;
  entityId?: string | null;
  entityType: string;
  metadata?: Record<string, unknown>;
};

export async function createAuditLog({
  action,
  entityId,
  entityType,
  metadata = {},
}: AuditLogInput) {
  if (!supabase) {
    return;
  }

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return;
  }

  await supabase.from('audit_logs').insert({
    action,
    actor_id: userData.user.id,
    entity_id: entityId ?? null,
    entity_type: entityType,
    metadata,
  });
}
