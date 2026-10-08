import { supabase } from '@/lib/supabase';
import { fallbackPortraitPackages, fallbackServices, getFallbackServiceBySlug } from '@/data/service-catalog';
import { createAuditLog } from '@/services/audit-log';
import { emitCatalogChanged } from '@/services/catalog-events';
import { AdminServiceCatalog, ClientServiceCatalog, PackageCatalogItem, ServiceCatalogItem, ServiceHighlight, ServiceSlug } from '@/types/services';

type ServiceRow = {
  archived_at?: string | null;
  buffer_minutes: number | null;
  description: string | null;
  duration_minutes: number | null;
  id: string;
  image_url: string | null;
  is_active: boolean;
  minimum_notice_days: number | null;
  name: string;
  price: number | null;
  slug: ServiceSlug | null;
};

type PackageRow = {
  archived_at?: string | null;
  badge: string | null;
  id: string;
  inclusions: string[] | null;
  image_url: string | null;
  is_active: boolean;
  name: string;
  price: number;
  service_id: string;
};

export type ServiceFormValues = {
  basePrice: number;
  bufferMinutes: number | null;
  description: string;
  durationMinutes: number | null;
  id?: string;
  isActive: boolean;
  imageUrl?: string | null;
  minimumNoticeDays: number | null;
  name: string;
  slug: string;
};

export type PackageFormValues = {
  badge: string | null;
  id?: string;
  inclusions: string[];
  imageUrl?: string | null;
  isActive: boolean;
  name: string;
  priceAmount: number;
  serviceId: string;
};

export async function getServiceHighlights(): Promise<ServiceHighlight[]> {
  if (!supabase) throw new Error('Studio highlights are not connected yet.');

  // Highlights use published service data only, without the catalog's bundled
  // sample-photo fallback. Keep the existing three-card dashboard layout.
  const highlights: ServiceHighlight[] = [];
  const pageSize = 12;
  for (let offset = 0; highlights.length < 3; offset += pageSize) {
    const { data, error } = await supabase.from('services')
      .select('id, name, slug, image_url')
      .eq('is_active', true)
      .is('archived_at', null)
      .not('image_url', 'is', null)
      .not('slug', 'is', null)
      .neq('image_url', '')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.image_url?.trim() && row.name?.trim() && row.slug?.trim()) {
        highlights.push({ id: row.id, imageUrl: row.image_url.trim(), name: row.name, slug: row.slug });
        if (highlights.length === 3) break;
      }
    }
    if ((data?.length ?? 0) < pageSize) break;
  }
  return highlights;
}

// Bounded pages prevent the API's row cap from silently truncating larger catalogs.
async function readCatalogRows<Row>(
  loadPage: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>,
  isSessionCurrent?: () => boolean,
): Promise<Row[]> {
  const rows: Row[] = [];
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    if (isSessionCurrent?.() === false) throw new Error('Your session changed.');
    const { data, error } = await loadPage(offset, offset + pageSize - 1);
    if (isSessionCurrent?.() === false) throw new Error('Your session changed.');
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}

// Strict admin read: a pair of paged reads supplies both lists and their counts.
// Errors and genuine empty catalogs must never become editable sample records.
export async function getAdminServiceCatalog(
  { isSessionCurrent }: { isSessionCurrent?: () => boolean } = {},
): Promise<AdminServiceCatalog> {
  if (!supabase) throw new Error('Services are not connected yet.');
  const connection = supabase;
  const [serviceRows, packageRows] = await Promise.all([
    readCatalogRows<ServiceRow>((from, to) => connection.from('services')
      .select('id, slug, name, description, duration_minutes, buffer_minutes, minimum_notice_days, price, image_url, is_active, archived_at')
      .is('archived_at', null)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to), isSessionCurrent),
    readCatalogRows<PackageRow>((from, to) => connection.from('packages')
      .select('id, service_id, name, badge, price, inclusions, image_url, is_active, archived_at')
      .is('archived_at', null)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to), isSessionCurrent),
  ]);
  const liveServices = serviceRows.filter((row) => row.archived_at == null);
  const servicesById = new Map(liveServices.map((row) => [row.id, row]));
  const livePackages = packageRows.filter((row) => row.archived_at == null && servicesById.has(row.service_id));
  const packageCounts = countPackagesByService(livePackages, true);
  return {
    services: liveServices.map((row, index) => mapServiceRow(row, index, packageCounts)),
    packages: livePackages.map((row, index) => {
      const service = servicesById.get(row.service_id);
      return mapPackageRow(row, index, service?.duration_minutes, service?.buffer_minutes, service?.minimum_notice_days);
    }),
  };
}

// One strict snapshot supplies client categories, packages, counts and rules.
// The browsing store owns freshness; this function always reads the server.
export async function getClientServiceCatalog(
  { isSessionCurrent }: { isSessionCurrent?: () => boolean } = {},
): Promise<ClientServiceCatalog> {
  if (!supabase) throw new Error('Services are not connected yet.');
  if (isSessionCurrent?.() === false) throw new Error('Your session changed.');
  const connection = supabase;
  const [allServices, allPackages] = await Promise.all([
    readCatalogRows<ServiceRow>((from, to) => connection.from('services')
      .select('id, slug, name, description, duration_minutes, buffer_minutes, minimum_notice_days, price, image_url, is_active, archived_at')
      .is('archived_at', null).eq('is_active', true).order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to), isSessionCurrent),
    readCatalogRows<PackageRow>((from, to) => connection.from('packages')
      .select('id, service_id, name, badge, price, inclusions, image_url, is_active, archived_at')
      .is('archived_at', null).eq('is_active', true).order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to), isSessionCurrent),
  ]);
  if (isSessionCurrent?.() === false) throw new Error('Your session changed.');
  const serviceRows = allServices
    .filter((row) => row.archived_at == null && row.is_active && row.slug?.trim());
  const servicesById = new Map(serviceRows.map((row) => [row.id, row]));
  const packageRows = allPackages
    .filter((row) => row.archived_at == null && row.is_active && servicesById.has(row.service_id));
  const packageCounts = countPackagesByService(packageRows);
  return {
    services: serviceRows.map((row, index) => ({ ...mapServiceRow(row, index, packageCounts),
      basePrice: Number(row.price ?? 0), bufferMinutes: row.buffer_minutes,
      durationMinutes: row.duration_minutes, minimumNoticeDays: row.minimum_notice_days })),
    packages: packageRows.map((row, index) => mapClientPackageRow(row, index, servicesById.get(row.service_id)!)),
  };
}

// Booking confirmation must bypass all browsing caches.
export async function getBookablePackage(id: string, serviceId: string): Promise<PackageCatalogItem | null> {
  if (!supabase) throw new Error('Services are not connected yet.');
  const { data, error } = await supabase.from('packages')
    .select('id, service_id, name, badge, price, inclusions, image_url, is_active, archived_at, services:service_id(is_active, archived_at, duration_minutes, buffer_minutes, minimum_notice_days)')
    .is('archived_at', null).eq('id', id).eq('service_id', serviceId).maybeSingle();
  if (error) throw error;
  const row = data as unknown as (PackageRow & { services: Pick<ServiceRow,
    'is_active' | 'archived_at' | 'duration_minutes' | 'buffer_minutes' | 'minimum_notice_days'> | null }) | null;
  if (!row || row.archived_at != null || row.id !== id || row.service_id !== serviceId || !row.is_active
    || !row.services?.is_active || row.services.archived_at != null) return null;
  if (!Number.isFinite(Number(row.price)) || row.price === null || Number(row.price) < 0) {
    throw new Error('The package price could not be verified.');
  }
  return mapClientPackageRow(row, 0, row.services);
}

function mapClientPackageRow(row: PackageRow, index: number, service: Pick<ServiceRow,
  'duration_minutes' | 'buffer_minutes' | 'minimum_notice_days'>): PackageCatalogItem {
  return { ...mapPackageRow(row, index, service.duration_minutes, service.buffer_minutes, service.minimum_notice_days),
    badge: row.badge ?? undefined, bufferMinutes: service.buffer_minutes,
    durationMinutes: service.duration_minutes, minimumNoticeDays: service.minimum_notice_days };
}

export async function saveServiceCategory(values: ServiceFormValues) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const payload = {
    description: values.description.trim(),
    buffer_minutes: values.bufferMinutes,
    duration_minutes: values.durationMinutes,
    image_url: values.imageUrl ?? null,
    is_active: values.isActive,
    minimum_notice_days: values.minimumNoticeDays,
    name: values.name.trim(),
    price: values.basePrice,
    slug: values.slug.trim(),
  };
  const query = values.id
    ? supabase.from('services').update(payload).eq('id', values.id).is('archived_at', null).select('id').maybeSingle()
    : supabase.from('services').insert(payload).select('id').single();
  const { data, error } = await query;

  if (error) {
    return { message: getServiceSaveErrorMessage(error.message), success: false };
  }

  if (!data?.id) {
    return { message: 'No service was saved. Please try again.', success: false };
  }

  emitCatalogChanged();

  await createAuditLog({
    action: values.id ? 'service.updated' : 'service.created',
    entityId: values.id ?? data?.id,
    entityType: 'service',
    metadata: {
      isActive: values.isActive,
      name: values.name.trim(),
      slug: values.slug.trim(),
    },
  });

  return { success: true };
}

function getServiceSaveErrorMessage(message: string) {
  if (message.includes('services_slug_key')) {
    return 'A service with this name already exists. Please use a different service name.';
  }

  return message;
}

export async function saveServicePackage(values: PackageFormValues) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const payload = {
    badge: values.badge,
    inclusions: values.inclusions,
    image_url: values.imageUrl ?? null,
    is_active: values.isActive,
    name: values.name.trim(),
    price: values.priceAmount,
    service_id: values.serviceId,
  };
  const query = values.id
    ? supabase.from('packages').update(payload).eq('id', values.id).is('archived_at', null).select('id').maybeSingle()
    : supabase.from('packages').insert(payload).select('id').single();
  const { data, error } = await query;

  if (error) {
    return { message: error.message, success: false };
  }

  if (!data?.id) {
    return { message: 'No package was saved. Please try again.', success: false };
  }

  emitCatalogChanged();

  await createAuditLog({
    action: values.id ? 'package.updated' : 'package.created',
    entityId: values.id ?? data?.id,
    entityType: 'package',
    metadata: {
      isActive: values.isActive,
      name: values.name.trim(),
      price: values.priceAmount,
      serviceId: values.serviceId,
    },
  });

  return { success: true };
}

export async function uploadCatalogImage({
  fileName,
  mimeType,
  uri,
}: {
  fileName?: string | null;
  mimeType?: string | null;
  uri: string;
}) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const extension = getFileExtension(fileName, mimeType);
  const path = `catalog/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const response = await fetch(uri);
  const blob = await response.blob();
  const { error } = await supabase.storage
    .from('service-images')
    .upload(path, blob, {
      contentType: mimeType ?? `image/${extension}`,
      upsert: false,
    });

  if (error) {
    return { message: error.message, success: false };
  }

  const { data } = supabase.storage.from('service-images').getPublicUrl(path);

  return { publicUrl: data.publicUrl, success: true };
}

export function archiveService(id: string) {
  return archiveCatalogItem('service', id);
}

export function archivePackage(id: string) {
  return archiveCatalogItem('package', id);
}

async function archiveCatalogItem(entity: 'service' | 'package', id: string) {
  if (!supabase) return { success: false, message: 'Supabase is not connected yet.' };
  try {
    // The server archives the record, checks booking references and writes its
    // audit entry in one transaction. Never report an unconfirmed deletion.
    const { data, error } = await supabase.rpc('archive_catalog_item', { p_entity: entity, p_id: id });
    if (error) return { success: false, message: error.message };
    if (data !== true) return { success: false, message: 'No item was deleted. Please reload and try again.' };
    emitCatalogChanged({ entity, id, isActive: false, isArchived: true });
    return { success: true };
  } catch {
    return { success: false, message: 'Could not delete this item. Please check your connection and try again.' };
  }
}




function countPackagesByService(rows: { service_id: string; is_active?: boolean }[], activeOnly = false) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!activeOnly || row.is_active) counts.set(row.service_id, (counts.get(row.service_id) ?? 0) + 1);
  }
  return counts;
}

function mapServiceRow(row: ServiceRow, index: number, packageCounts: ReadonlyMap<string, number>): ServiceCatalogItem {
  const slug = row.slug ?? 'portrait-photography';
  const fallback = getFallbackServiceBySlug(slug) ?? fallbackServices[index] ?? fallbackServices[0];
  const description = row.description ?? fallback.description;

  return {
    ...fallback,
    basePrice: Number(row.price ?? fallback.basePrice),
    bufferMinutes: row.buffer_minutes ?? fallback.bufferMinutes,
    cardDescription: formatServiceCardDescription(description),
    cardTitle: row.name,
    category: row.name.toUpperCase(),
    description,
    durationMinutes: row.duration_minutes ?? fallback.durationMinutes,
    id: row.id,
    image: row.image_url ? { uri: row.image_url } : fallback.image,
    imageUrl: row.image_url,
    isActive: row.is_active,
    minimumNoticeDays: row.minimum_notice_days ?? fallback.minimumNoticeDays,
    name: row.name,
    packageCount: packageCounts.get(row.id) ?? 0,
    route: `/services/${slug}`,
    slug,
  };
}

function formatServiceCardDescription(description: string) {
  const normalizedDescription = description.trim().replace(/\s+/g, ' ');

  if (normalizedDescription.length <= 26) {
    return normalizedDescription;
  }

  const words = normalizedDescription.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > 26 && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }

    if (lines.length === 2) {
      break;
    }
  }

  if (currentLine && lines.length < 2) {
    lines.push(currentLine);
  }

  return lines.join('\n');
}

function mapPackageRow(
  row: PackageRow,
  index: number,
  durationMinutes?: number | null,
  bufferMinutes?: number | null,
  minimumNoticeDays?: number | null,
): PackageCatalogItem {
  const fallback = fallbackPortraitPackages[index] ?? fallbackPortraitPackages[0];
  const inclusions = row.inclusions ?? [];

  return {
    ...fallback,
    badge: row.badge ?? fallback.badge,
    bufferMinutes: bufferMinutes ?? fallback.bufferMinutes,
    details: inclusions.join('\n'),
    durationMinutes: durationMinutes ?? fallback.durationMinutes,
    id: row.id,
    image: row.image_url ? { uri: row.image_url } : fallback.image,
    imageUrl: row.image_url,
    inclusions,
    isActive: row.is_active,
    minimumNoticeDays: minimumNoticeDays ?? fallback.minimumNoticeDays,
    name: row.name,
    price: `₱${Number(row.price).toLocaleString('en-PH')}`,
    priceAmount: Number(row.price),
    serviceId: row.service_id,
  };
}

function getFileExtension(fileName?: string | null, mimeType?: string | null) {
  const fileExtension = fileName?.split('.').pop()?.toLowerCase();

  if (fileExtension && fileExtension.length <= 5) {
    return fileExtension === 'jpeg' ? 'jpg' : fileExtension;
  }

  if (mimeType?.includes('/')) {
    const mimeExtension = mimeType.split('/').pop()?.toLowerCase();

    if (mimeExtension) {
      return mimeExtension === 'jpeg' ? 'jpg' : mimeExtension;
    }
  }

  return 'jpg';
}
