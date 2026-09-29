import { supabase } from '@/lib/supabase';
import { fallbackPortraitPackages, fallbackServices, getFallbackServiceBySlug } from '@/data/service-catalog';
import { createAuditLog } from '@/services/audit-log';
import { PackageCatalogItem, ServiceCatalogItem, ServiceSlug } from '@/types/services';

type ServiceRow = {
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
  badge: string | null;
  id: string;
  inclusions: string[] | null;
  image_url: string | null;
  is_active: boolean;
  name: string;
  price: number;
  service_id: string;
};

const packageCatalogCache = new Map<ServiceSlug, PackageCatalogItem[]>();
const serviceCatalogBySlugCache = new Map<ServiceSlug, ServiceCatalogItem>();
let adminPackageCatalogCache: PackageCatalogItem[] | null = null;
let adminServicesCatalogCache: ServiceCatalogItem[] | null = null;
let servicesCatalogCache: ServiceCatalogItem[] | null = null;

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

export function getCachedServicesCatalog() {
  return servicesCatalogCache;
}

export function getCachedAdminServicesCatalog() {
  return adminServicesCatalogCache;
}

export function getCachedAdminPackagesCatalog() {
  return adminPackageCatalogCache;
}

export function getCachedServiceCatalogBySlug(slug: ServiceSlug) {
  return serviceCatalogBySlugCache.get(slug) ?? null;
}

export function getCachedPackagesForService(slug: ServiceSlug) {
  return packageCatalogCache.get(slug) ?? null;
}

export async function getServicesCatalog(): Promise<ServiceCatalogItem[]> {
  if (!supabase) {
    return fallbackServices;
  }

  const { data, error } = await supabase
    .from('services')
    .select('id, slug, name, description, duration_minutes, buffer_minutes, minimum_notice_days, price, image_url, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error || !data?.length) {
    return servicesCatalogCache ?? fallbackServices;
  }

  const serviceIds = data.map((service) => service.id);
  const { data: packages } = await supabase
    .from('packages')
    .select('service_id')
    .in('service_id', serviceIds)
    .eq('is_active', true);

  const items = data.map((row, index) => mapServiceRow(row as ServiceRow, index, packages ?? []));

  servicesCatalogCache = items;
  items.forEach((item) => serviceCatalogBySlugCache.set(item.slug, item));

  return items;
}

export async function getServiceCatalogBySlug(slug: ServiceSlug): Promise<ServiceCatalogItem | null> {
  const fallback = getFallbackServiceBySlug(slug);

  if (!supabase) {
    return fallback ?? null;
  }

  const { data, error } = await supabase
    .from('services')
    .select('id, slug, name, description, duration_minutes, buffer_minutes, minimum_notice_days, price, image_url, is_active')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    return serviceCatalogBySlugCache.get(slug) ?? fallback ?? null;
  }

  const { data: packages } = await supabase
    .from('packages')
    .select('service_id')
    .eq('service_id', data.id)
    .eq('is_active', true);

  const item = mapServiceRow(data as ServiceRow, fallbackServices.findIndex((service) => service.slug === slug), packages ?? []);

  serviceCatalogBySlugCache.set(slug, item);

  return item;
}

export async function getAdminServicesCatalog(): Promise<ServiceCatalogItem[]> {
  if (!supabase) {
    return fallbackServices;
  }

  const { data, error } = await supabase
    .from('services')
    .select('id, slug, name, description, duration_minutes, buffer_minutes, minimum_notice_days, price, image_url, is_active')
    .order('created_at', { ascending: true });

  if (error || !data?.length) {
    return fallbackServices;
  }

  const serviceIds = data.map((service) => service.id);
  const { data: packages } = await supabase
    .from('packages')
    .select('service_id')
    .in('service_id', serviceIds)
    .eq('is_active', true);

  const items = data.map((row, index) => mapServiceRow(row as ServiceRow, index, packages ?? []));

  adminServicesCatalogCache = items;

  return items;
}

export async function getPackagesForService(slug: ServiceSlug): Promise<PackageCatalogItem[]> {
  const fallbackService = getFallbackServiceBySlug(slug);

  if (!supabase) {
    return slug === 'portrait-photography' ? fallbackPortraitPackages : [];
  }

  const { data: service } = await supabase
    .from('services')
    .select('id, duration_minutes, buffer_minutes, minimum_notice_days')
    .eq('slug', slug)
    .maybeSingle();

  if (!service?.id) {
    return slug === 'portrait-photography' ? fallbackPortraitPackages : [];
  }

  const { data, error } = await supabase
    .from('packages')
    .select('id, service_id, name, badge, price, inclusions, image_url, is_active')
    .eq('service_id', service.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error || !data?.length) {
    return packageCatalogCache.get(slug) ?? (slug === 'portrait-photography' ? fallbackPortraitPackages : []);
  }

  const items = data.map((row, index) =>
    mapPackageRow(
      row as PackageRow,
      index,
      Number(service.duration_minutes ?? fallbackService?.durationMinutes ?? 0),
      Number(service.buffer_minutes ?? fallbackService?.bufferMinutes ?? 0),
      Number(service.minimum_notice_days ?? fallbackService?.minimumNoticeDays ?? 0),
    ),
  );

  packageCatalogCache.set(slug, items);

  return items;
}

export async function getAdminPackagesCatalog(): Promise<PackageCatalogItem[]> {
  if (!supabase) {
    return fallbackPortraitPackages;
  }

  const { data, error } = await supabase
    .from('packages')
    .select('id, service_id, name, badge, price, inclusions, image_url, is_active')
    .order('created_at', { ascending: true });

  if (error || !data?.length) {
    return fallbackPortraitPackages;
  }

  const items = data.map((row, index) => mapPackageRow(row as PackageRow, index));

  adminPackageCatalogCache = items;

  return items;
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
    ? supabase.from('services').update(payload).eq('id', values.id).select('id').maybeSingle()
    : supabase.from('services').insert(payload).select('id').single();
  const { data, error } = await query;

  if (error) {
    return { message: error.message, success: false };
  }

  const savedId = values.id ?? data?.id;
  const cachedSlug = values.slug.trim();

  if (savedId) {
    updateCachedService({
      id: savedId,
      values: {
        ...values,
        slug: cachedSlug,
      },
    });
  }

  adminServicesCatalogCache = null;

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
    ? supabase.from('packages').update(payload).eq('id', values.id).select('id').maybeSingle()
    : supabase.from('packages').insert(payload).select('id').single();
  const { data, error } = await query;

  if (error) {
    return { message: error.message, success: false };
  }

  invalidatePackageCache(values.serviceId);
  adminPackageCatalogCache = null;

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

function updateCachedService({ id, values }: { id: string; values: ServiceFormValues }) {
  const applyValues = (item: ServiceCatalogItem): ServiceCatalogItem => ({
    ...item,
    basePrice: values.basePrice,
    bufferMinutes: values.bufferMinutes,
    description: values.description.trim(),
    durationMinutes: values.durationMinutes,
    id,
    image: values.imageUrl ? { uri: values.imageUrl } : item.image,
    imageUrl: values.imageUrl ?? item.imageUrl,
    isActive: values.isActive,
    minimumNoticeDays: values.minimumNoticeDays,
    name: values.name.trim(),
    route: `/services/${values.slug}`,
    slug: values.slug,
  });

  const existing = serviceCatalogBySlugCache.get(values.slug);

  if (existing) {
    serviceCatalogBySlugCache.set(values.slug, applyValues(existing));
  }

  if (servicesCatalogCache) {
    servicesCatalogCache = values.isActive
      ? servicesCatalogCache.map((item) => (item.id === id ? applyValues(item) : item))
      : servicesCatalogCache.filter((item) => item.id !== id);
  }
}

function invalidatePackageCache(serviceId: string) {
  packageCatalogCache.forEach((items, slug) => {
    if (items.some((item) => item.serviceId === serviceId)) {
      packageCatalogCache.delete(slug);
    }
  });
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

export async function setServiceActive(id: string, isActive: boolean) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  if (!isActive) {
    const { count, error: bookingCountError } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('service_id', id);

    if (bookingCountError) {
      return { message: bookingCountError.message, success: false };
    }

    if ((count ?? 0) > 0) {
      return {
        message: 'This service has existing bookings and cannot be deleted.',
        success: false,
      };
    }
  }

  const { data, error } = await supabase
    .from('services')
    .update({ is_active: isActive })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    return { message: error.message, success: false };
  }

  if (!data) {
    return { message: 'No service was updated. Please refresh and try again.', success: false };
  }

  await createAuditLog({
    action: isActive ? 'service.activated' : 'service.deactivated',
    entityId: id,
    entityType: 'service',
    metadata: { isActive },
  });

  adminServicesCatalogCache = adminServicesCatalogCache?.map((item) => (item.id === id ? { ...item, isActive } : item)) ?? null;
  servicesCatalogCache = isActive
    ? servicesCatalogCache
    : servicesCatalogCache?.filter((item) => item.id !== id) ?? null;

  return { success: true };
}

export async function setPackageActive(id: string, isActive: boolean) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  if (!isActive) {
    const { count, error: bookingCountError } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('package_id', id);

    if (bookingCountError) {
      return { message: bookingCountError.message, success: false };
    }

    if ((count ?? 0) > 0) {
      return {
        message: 'This package has existing bookings and cannot be deleted.',
        success: false,
      };
    }
  }

  const { data, error } = await supabase
    .from('packages')
    .update({ is_active: isActive })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    return { message: error.message, success: false };
  }

  if (!data) {
    return { message: 'No package was updated. Please refresh and try again.', success: false };
  }

  await createAuditLog({
    action: isActive ? 'package.activated' : 'package.deactivated',
    entityId: id,
    entityType: 'package',
    metadata: { isActive },
  });

  adminPackageCatalogCache = adminPackageCatalogCache?.map((item) => (item.id === id ? { ...item, isActive } : item)) ?? null;

  return { success: true };
}

function mapServiceRow(row: ServiceRow, index: number, packageRows: { service_id: string }[]): ServiceCatalogItem {
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
    packageCount: packageRows.filter((packageRow) => packageRow.service_id === row.id).length,
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
