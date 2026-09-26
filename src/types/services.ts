import { type ImageSource } from 'expo-image';

export type ServiceSlug = string;

export type ServiceCatalogItem = {
  basePrice: number;
  bufferMinutes: number | null;
  cardDescription: string;
  cardTitle: string;
  category: string;
  description: string;
  durationMinutes: number | null;
  id: string;
  image: ImageSource;
  imageHeight: number;
  imageUrl?: string | null;
  isActive: boolean;
  minimumNoticeDays: number | null;
  name: string;
  packageCount: number;
  route?: `/services/${string}`;
  slug: ServiceSlug;
  titleSize?: number;
  top: number;
};

export type PackageCatalogItem = {
  badge?: string;
  bufferMinutes?: number | null;
  details: string;
  durationMinutes?: number | null;
  id: string;
  image: ImageSource;
  imageUrl?: string | null;
  inclusions: string[];
  isActive: boolean;
  minimumNoticeDays?: number | null;
  name: string;
  price: string;
  priceAmount: number;
  serviceId: string;
  top: number;
};
