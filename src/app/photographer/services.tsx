import { useBottomNavHeight } from '@/hooks/use-bottom-nav-height';
import { useClientNavScroll as useNavScroll } from '@/hooks/use-client-nav-scroll';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { showAppAlert } from '@/components/app-alert';
import { AdminBrandHeader } from '@/components/admin-brand-header';
import { useAdminServiceCatalog } from '@/hooks/use-admin-service-catalog';
import { useMountedRef } from '@/hooks/use-mounted-ref';
import {
  saveServiceCategory,
  saveServicePackage,
  archivePackage,
  archiveService,
  type PackageFormValues,
  type ServiceFormValues,
  uploadCatalogImage,
} from '@/services/service-catalog';
import { photographerStyles as styles } from '@/styles/photographer.styles';
import { adminColors } from '@/styles/admin-theme';
import { serviceFormStyles as formStyles } from '@/styles/service-form.styles';
import { type PackageCatalogItem, type ServiceCatalogItem } from '@/types/services';

const thumbnailToneStyles = [
  styles.serviceThumbTone1,
  styles.serviceThumbTone2,
  styles.serviceThumbTone3,
  styles.serviceThumbTone4,
];

type ActiveView = 'categories' | 'packages';

export default function PhotographerServicesScreen() {
  const catalog = useAdminServiceCatalog();
  // Reset forms, selections and pending actions when account scope changes.
  return <PhotographerServicesContent key={catalog.accountId ?? 'signed-out'} catalog={catalog} />;
}

function PhotographerServicesContent({ catalog }: { catalog: ReturnType<typeof useAdminServiceCatalog> }) {
  const navHeight = useBottomNavHeight('admin');
  const navScroll = useNavScroll();
  const insets = useSafeAreaInsets();
  const mounted = useMountedRef();
  const { services, packages, error, isLoading, isRefreshing, refresh, reconcile: refreshCatalog } = catalog;
  const [activeView, setActiveView] = useState<ActiveView>('categories');
  const [editingPackage, setEditingPackage] = useState<PackageCatalogItem | null>(null);
  const [editingService, setEditingService] = useState<ServiceCatalogItem | null>(null);
  const [isPackageFormVisible, setIsPackageFormVisible] = useState(false);
  const [isServiceFormVisible, setIsServiceFormVisible] = useState(false);
  const [isDeletingPackage, setIsDeletingPackage] = useState(false);
  const [isDeletingService, setIsDeletingService] = useState(false);
  const [pendingDeletePackage, setPendingDeletePackage] = useState<PackageCatalogItem | null>(null);
  const [pendingDeleteService, setPendingDeleteService] = useState<ServiceCatalogItem | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const bottomPadding = navHeight + insets.bottom + 24;
  // Admins need inactive records too, so they can edit and reactivate them.
  // Client visibility is still filtered by the client catalog service.
  const selectedService = services.find((service) => service.id === selectedServiceId) ?? services[0] ?? null;
  const visiblePackages = packages.filter((item) => selectedService?.id === item.serviceId);

  function openAddForm() {
    if (isLoading || error) return;
    if (activeView === 'categories') {
      setEditingService(null);
      setIsServiceFormVisible(true);
      return;
    }

    if (!services.length) {
      showAppAlert('Add a category first', 'Please create a service category before adding packages.');
      return;
    }

    setEditingPackage(null);
    setIsPackageFormVisible(true);
  }

  function deleteService(service: ServiceCatalogItem) {
    setPendingDeleteService(service);
  }

  async function confirmDeleteService() {
    if (!pendingDeleteService || isDeletingService) {
      return;
    }

    setIsDeletingService(true);

    const result = await archiveService(pendingDeleteService.id);

    if (!mounted.current) return;

    if (!result.success) {
      setIsDeletingService(false);
      showAppAlert('Service not updated', result.message ?? 'Please try again.');
      return;
    }

    setPendingDeleteService(null);
    setIsDeletingService(false);
    await refreshCatalog();
  }

  function deletePackage(item: PackageCatalogItem) {
    setPendingDeletePackage(item);
  }

  async function confirmDeletePackage() {
    if (!pendingDeletePackage || isDeletingPackage) {
      return;
    }

    setIsDeletingPackage(true);

    const result = await archivePackage(pendingDeletePackage.id);

    if (!mounted.current) return;

    if (!result.success) {
      setIsDeletingPackage(false);
      showAppAlert('Package not updated', result.message ?? 'Please try again.');
      return;
    }

    setPendingDeletePackage(null);
    setIsDeletingPackage(false);
    await refreshCatalog();
  }

  return (
    <View style={[styles.container, styles.adminCurvedHeaderScreen]}>
      <StatusBar style="light" />
      <AdminBrandHeader
        textureSource={require('@/assets/images/admin-calendar-banner.png')}
        topInset={insets.top}
      />
      <View
        style={[
          styles.servicesFigmaSurface,
          { paddingHorizontal: 0, paddingTop: 0 },
        ]}>
        <FlatList<PackageCatalogItem | ServiceCatalogItem>
          key={activeView === 'packages' ? 'packages-' + selectedService?.id : 'categories'}
          {...navScroll}
          data={activeView === 'packages' ? visiblePackages : services}
          extraData={catalog}
          keyExtractor={(item) => item.id}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          alwaysBounceVertical
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { void refresh(); }} />}
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 17, paddingBottom: bottomPadding }}
          ItemSeparatorComponent={() => <View style={{ height: activeView === 'packages' ? 15 : 8 }} />}
          ListHeaderComponent={
            <>
            {isLoading || error ? <Text accessibilityLiveRegion="polite" style={styles.servicesCategorySubtitle}>{error ?? 'Loading services...'}</Text> : null}
            {activeView === 'packages' ? (<View style={styles.servicesPackageHeader}>
              <Pressable
                accessibilityLabel="Back to service categories"
                accessibilityRole="button"
                hitSlop={12}
                onPress={() => setActiveView('categories')}
                style={({ pressed }) => [styles.servicesBackButton, pressed && { opacity: 0.72 }]}>
                <ServiceBackIcon />
              </Pressable>
              <View style={styles.servicesPackageHeaderCopy}>
                <Text style={styles.servicesPackageTitle}>{selectedService?.name ?? 'Services'}</Text>
                <Text style={styles.servicesPackageCount}>{formatPackageCount(visiblePackages.length)}</Text>
                {selectedService && !selectedService.isActive ? (
                  <Text style={styles.servicesPackageCount}>Service inactive · Hidden from clients</Text>
                ) : null}
              </View>
              <Pressable
                accessibilityLabel="Add package"
                accessibilityRole="button"
                disabled={isLoading || Boolean(error)}
                onPress={openAddForm}
                style={({ pressed }) => [styles.servicesFigmaAddButton, pressed && { opacity: 0.84 }]}>
                <Text style={styles.servicesFigmaAddText}>+</Text>
              </Pressable>
            </View>) : (<View style={styles.servicesCategoryIntro}>
              <Text style={styles.servicesCategoryTitle}>Services</Text>
              <Text style={styles.servicesCategorySubtitle}>Manage your service categories and packages.</Text>
              <Pressable
                accessibilityLabel="Add service category"
                accessibilityRole="button"
                disabled={isLoading || Boolean(error)}
                onPress={openAddForm}
                style={({ pressed }) => [styles.servicesCategoryAddButton, pressed && { opacity: 0.84 }]}>
                <Text style={styles.servicesCategoryAddText}>+ Add</Text>
              </Pressable>
            </View>)}
            <View style={{ height: 16 }} />
            </>
          }
          renderItem={({ item }) => activeView === 'packages' ? (
            <AdminPackageItem item={item as PackageCatalogItem} variant="figma"
              onEdit={() => { setEditingPackage(item as PackageCatalogItem); setIsPackageFormVisible(true); }}
              onToggle={() => deletePackage(item as PackageCatalogItem)} />
          ) : (
            <View>
              <AdminServiceItem service={item as ServiceCatalogItem}
                onDelete={() => deleteService(item as ServiceCatalogItem)}
                onEdit={() => { setEditingService(item as ServiceCatalogItem); setIsServiceFormVisible(true); }}
                onOpen={() => { setSelectedServiceId(item.id); setActiveView('packages'); }} />
            </View>
          )}
          ListEmptyComponent={!isLoading && !error ? (
            <View style={styles.servicesEmptyPackagesCard}>
              {activeView === 'packages' ? <EmptyPackagesIcon /> : null}
              <Text style={styles.servicesEmptyPackagesTitle}>{activeView === 'packages' ? 'No packages yet' : 'No services yet'}</Text>
              <Text style={styles.servicesEmptyPackagesText}>{activeView === 'packages' ? 'Add a package for this service to show it here.' : 'Add a service category to get started.'}</Text>
            </View>
          ) : null}
        />
      </View>

      <ServiceFormModal
        key={`service-${editingService?.id ?? 'new'}-${isServiceFormVisible}`}
        onClose={() => setIsServiceFormVisible(false)}
        onSaved={refreshCatalog}
        service={editingService}
        services={services}
        visible={isServiceFormVisible}
      />
      <PackageFormModal
        item={editingPackage}
        key={`package-${editingPackage?.id ?? 'new'}-${isPackageFormVisible}`}
        lockedServiceId={activeView === 'packages' ? selectedService?.id ?? null : null}
        onClose={() => setIsPackageFormVisible(false)}
        onSaved={refreshCatalog}
        services={services}
        visible={isPackageFormVisible}
      />
      <DeleteServiceModal
        isDeleting={isDeletingService}
        onCancel={() => {
          if (!isDeletingService) {
            setPendingDeleteService(null);
          }
        }}
        onDelete={confirmDeleteService}
        service={pendingDeleteService}
      />
      <DeletePackageModal
        isDeleting={isDeletingPackage}
        onCancel={() => {
          if (!isDeletingPackage) {
            setPendingDeletePackage(null);
          }
        }}
        onDelete={confirmDeletePackage}
        packageItem={pendingDeletePackage}
      />
    </View>
  );
}

function DeletePackageModal({
  isDeleting,
  onCancel,
  onDelete,
  packageItem,
}: {
  isDeleting: boolean;
  onCancel: () => void;
  onDelete: () => void;
  packageItem: PackageCatalogItem | null;
}) {
  return (
    <Modal animationType="none" onRequestClose={onCancel} transparent visible={Boolean(packageItem)}>
      <View style={formStyles.confirmOverlay}>
        <View style={formStyles.confirmCard}>
          <Text style={formStyles.confirmTitle}>Delete package?</Text>
          <Text style={formStyles.confirmMessage}>
            {packageItem
              ? `${packageItem.name} will be removed from your catalog. To temporarily turn it off, cancel and use the Active switch in Edit. Packages with existing bookings cannot be deleted.`
              : ''}
          </Text>
          <View style={formStyles.confirmActions}>
            <Pressable
              accessibilityRole="button"
              disabled={isDeleting}
              onPress={onCancel}
              style={[formStyles.confirmCancelButton, isDeleting && { opacity: 0.7 }]}>
              <Text style={formStyles.confirmCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isDeleting}
              onPress={onDelete}
              style={[formStyles.confirmDeleteButton, isDeleting && { opacity: 0.7 }]}>
              <Text style={formStyles.confirmDeleteText}>{isDeleting ? 'Deleting...' : 'Delete'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DeleteServiceModal({
  isDeleting,
  onCancel,
  onDelete,
  service,
}: {
  isDeleting: boolean;
  onCancel: () => void;
  onDelete: () => void;
  service: ServiceCatalogItem | null;
}) {
  return (
    <Modal animationType="none" onRequestClose={onCancel} transparent visible={Boolean(service)}>
      <View style={formStyles.confirmOverlay}>
        <View style={formStyles.confirmCard}>
          <Text style={formStyles.confirmTitle}>Delete service?</Text>
          <Text style={formStyles.confirmMessage}>
            {service
              ? `${service.name} and its packages will be removed from your catalog. To temporarily turn it off, cancel and use the Active switch in Edit. Services with existing bookings cannot be deleted.`
              : ''}
          </Text>
          <View style={formStyles.confirmActions}>
            <Pressable
              accessibilityRole="button"
              disabled={isDeleting}
              onPress={onCancel}
              style={[formStyles.confirmCancelButton, isDeleting && { opacity: 0.7 }]}>
              <Text style={formStyles.confirmCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isDeleting}
              onPress={onDelete}
              style={[formStyles.confirmDeleteButton, isDeleting && { opacity: 0.7 }]}>
              <Text style={formStyles.confirmDeleteText}>{isDeleting ? 'Deleting...' : 'Delete'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AdminServiceItem({
  onDelete,
  onEdit,
  onOpen,
  service,
}: {
  onDelete: () => void;
  onEdit: () => void;
  onOpen: () => void;
  service: ServiceCatalogItem;
}) {
  return (
    <View style={styles.servicesCategoryFigmaCard}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${service.name}${service.isActive ? '' : ', inactive'}`}
        onPress={onOpen} style={styles.servicesCategoryFigmaOpenArea}>
        <Image contentFit="cover" source={service.image} style={styles.servicesCategoryFigmaImage} />
        <View style={styles.servicesCategoryFigmaCopy}>
          <Text style={styles.servicesCategoryFigmaName}>{service.name}</Text>
          <Text style={styles.servicesCategoryFigmaCount}>{formatPackageCount(service.packageCount)}</Text>
          {!service.isActive ? (
            <Text style={styles.servicesCategoryFigmaCount}>Inactive · Edit to enable</Text>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.servicesCategoryFigmaActions}>
        <Pressable accessibilityLabel={`Edit ${service.name}`} accessibilityRole="button" style={styles.adminCatalogEditButton} onPress={onEdit}>
          <ServiceEditIcon />
        </Pressable>
        <Pressable accessibilityLabel={`Delete ${service.name}`} accessibilityRole="button" style={styles.adminCatalogDeleteButton} onPress={onDelete}>
          <ServiceDeleteIcon />
        </Pressable>
      </View>
    </View>
  );
}

function AdminPackageItem({
  item,
  onEdit,
  onToggle,
  variant = 'default',
}: {
  item: PackageCatalogItem;
  onEdit: () => void;
  onToggle: () => void;
  variant?: 'default' | 'figma';
}) {
  if (variant === 'figma') {
    return (
      <View style={styles.servicesPackageCard}>
        <Image contentFit="cover" source={item.image} style={styles.servicesPackageImage} />
        <View style={styles.servicesPackageCopy}>
          <Text style={styles.servicesPackageName}>{item.name}</Text>
          <Text style={styles.servicesPackagePrice}>{item.price}</Text>
          {!item.isActive ? (
            <Text style={styles.servicesPackagePrice}>Inactive · Edit to enable</Text>
          ) : null}
          <View style={styles.servicesInclusionList}>
            {item.inclusions.slice(0, 6).map((inclusion, index) => (
              <View key={`${item.id}-${index}`} style={styles.servicesInclusionRow}>
                <View style={styles.servicesInclusionDot} />
                <Text style={styles.servicesInclusionText}>{inclusion}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.servicesPackageActions}>
          <Pressable accessibilityLabel="Edit package" accessibilityRole="button" style={styles.adminCatalogEditButton} onPress={onEdit}>
            <ServiceEditIcon />
          </Pressable>
          <Pressable accessibilityLabel="Delete package" accessibilityRole="button" style={styles.adminCatalogDeleteButton} onPress={onToggle}>
            <ServiceDeleteIcon />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.serviceCategoryCard}>
      <View style={[styles.serviceCategoryThumb, thumbnailToneStyles[0]]}>
        <Image contentFit="cover" source={item.image} style={styles.serviceThumbImage} />
      </View>
      <View style={styles.serviceCategoryCopy}>
        <Text style={styles.serviceCategoryName}>{item.name}</Text>
        <Text style={styles.serviceCategoryCount}>
          {item.price} | {item.isActive ? 'Active' : 'Inactive'}
        </Text>
      </View>
      <View style={styles.serviceManageActions}>
        <Pressable accessibilityRole="button" onPress={onEdit} style={styles.serviceManageButton}>
          <Text style={styles.serviceManageText}>Edit</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onToggle} style={styles.serviceManageButton}>
          <Text style={styles.serviceManageText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ServiceFormModal({
  onClose,
  onSaved,
  service,
  services,
  visible,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  service: ServiceCatalogItem | null;
  services: ServiceCatalogItem[];
  visible: boolean;
}) {
  const mounted = useMountedRef();
  const [basePrice, setBasePrice] = useState(service ? String(service.basePrice) : '');
  const [bufferMinutes, setBufferMinutes] = useState(service?.bufferMinutes ? String(service.bufferMinutes) : '30');
  const [description, setDescription] = useState(service?.description ?? '');
  const [durationHours, setDurationHours] = useState(service?.durationMinutes ? formatDurationHours(service.durationMinutes) : '');
  const [durationMinutes, setDurationMinutes] = useState(service?.durationMinutes ? formatDurationMinutes(service.durationMinutes) : '');
  const [formError, setFormError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(service?.isActive ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [minimumNoticeDays, setMinimumNoticeDays] = useState(service?.minimumNoticeDays ? String(service.minimumNoticeDays) : '1');
  const [pickedImage, setPickedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [name, setName] = useState(service?.name ?? '');

  async function handleSave() {
    if (isSaving) {
      return;
    }

    setFormError(null);

    if (!name.trim()) {
      setFormError('Please enter a service category name.');
      return;
    }

    const generatedSlug = toSlug(name);

    if (!generatedSlug) {
      setFormError('Please use letters or numbers in the service category name.');
      return;
    }

    const hasDuplicateSlug = services.some((item) => item.id !== service?.id && item.slug === generatedSlug);

    if (hasDuplicateSlug) {
      setFormError('A service with this name already exists. Please use a different service name.');
      return;
    }

    setIsSaving(true);

    const uploadedImageUrl = await uploadPickedImage(pickedImage);

    if (!mounted.current) return;

    if (uploadedImageUrl === false) {
      setIsSaving(false);
      setFormError('The image could not be uploaded. Please check your Supabase Storage setup and try again.');
      return;
    }

    const formValues: ServiceFormValues = {
      basePrice: Number(basePrice || 0),
      bufferMinutes: bufferMinutes ? Math.round(Number(bufferMinutes)) : 0,
      description,
      durationMinutes: getDurationTotalMinutes(durationHours, durationMinutes),
      id: service?.id,
      imageUrl: uploadedImageUrl ?? service?.imageUrl ?? null,
      isActive,
      minimumNoticeDays: minimumNoticeDays ? Math.round(Number(minimumNoticeDays)) : 0,
      name,
      slug: generatedSlug,
    };
    const result = await saveServiceCategory(formValues);

    if (!mounted.current) return;

    if (!result.success) {
      setIsSaving(false);
      setFormError(result.message ?? 'Service not saved. Please try again.');
      return;
    }

    await onSaved();
    if (!mounted.current) return;
    setIsSaving(false);
    onClose();
  }

  return (
    <Modal animationType="none" onRequestClose={onClose} visible={visible}>
      <CatalogFormLayout
        closeLabel="Close service form"
        formError={formError}
        isSaving={isSaving}
        onClose={onClose}
        onSave={handleSave}
        saveLabel="Save Service"
        title={service ? 'Edit Service' : 'Add New Service'}
        visible={visible}>
        <View style={formStyles.sectionCard}>
          <FormInput label="Service Name" onChangeText={setName} required value={name} />
          <FormInput label="Description" multiline onChangeText={setDescription} value={description} />
          <FormInput keyboardType="numeric" label="Base Price" onChangeText={setBasePrice} required value={basePrice} />
        </View>
        <View style={formStyles.sectionCard}>
          <View style={formStyles.fieldRow}>
            <FormInput compact keyboardType="numeric" label="Duration Hours" onChangeText={setDurationHours} value={durationHours} />
            <FormInput compact keyboardType="numeric" label="Duration Minutes" onChangeText={setDurationMinutes} value={durationMinutes} />
          </View>
          <FormInput keyboardType="numeric" label="Preparation Time (minutes)" onChangeText={setBufferMinutes} value={bufferMinutes} />
          <FormInput keyboardType="numeric" label="Minimum Notice (days)" onChangeText={setMinimumNoticeDays} value={minimumNoticeDays} />
        </View>
        <View style={formStyles.sectionCard}>
          <ImagePickerField
            fallbackSource={service?.image}
            imageUrl={service?.imageUrl}
            label="Add Photo"
            pickedImage={pickedImage}
            onPick={setPickedImage}
          />
          <ActiveToggle isActive={isActive} onPress={() => setIsActive((value) => !value)} />
        </View>
      </CatalogFormLayout>
    </Modal>
  );
}

function PackageFormModal({
  item,
  lockedServiceId,
  onClose,
  onSaved,
  services,
  visible,
}: {
  item: PackageCatalogItem | null;
  lockedServiceId?: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  services: ServiceCatalogItem[];
  visible: boolean;
}) {
  const mounted = useMountedRef();
  const [badge, setBadge] = useState(item?.badge ?? '');
  const [inclusions, setInclusions] = useState(item?.inclusions.length ? item.inclusions : ['']);
  const [formError, setFormError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState(item?.name ?? '');
  const [pickedImage, setPickedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [priceAmount, setPriceAmount] = useState(item ? String(item.priceAmount) : '');
  const [serviceId, setServiceId] = useState(item?.serviceId ?? lockedServiceId ?? services[0]?.id ?? '');
  const selectedService = services.find((service) => service.id === serviceId);
  const isCategoryLocked = Boolean(lockedServiceId);

  async function handleSave() {
    if (isSaving) {
      return;
    }

    setFormError(null);

    if (!name.trim() || !serviceId) {
      setFormError('Please enter a package name and choose a category.');
      return;
    }

    setIsSaving(true);

    const uploadedImageUrl = await uploadPickedImage(pickedImage);

    if (!mounted.current) return;

    if (uploadedImageUrl === false) {
      setIsSaving(false);
      setFormError('The image could not be uploaded. Please check your Supabase Storage setup and try again.');
      return;
    }

    const formValues: PackageFormValues = {
      badge: badge.trim() || null,
      id: item?.id,
      imageUrl: uploadedImageUrl ?? item?.imageUrl ?? null,
      inclusions: inclusions
        .map((line) => line.trim())
        .filter(Boolean),
      isActive,
      name,
      priceAmount: Number(priceAmount || 0),
      serviceId,
    };
    const result = await saveServicePackage(formValues);

    if (!mounted.current) return;

    if (!result.success) {
      setIsSaving(false);
      setFormError(result.message ?? 'Package not saved. Please try again.');
      return;
    }

    await onSaved();
    if (!mounted.current) return;
    setIsSaving(false);
    onClose();
  }

  function updateInclusion(index: number, value: string) {
    setInclusions((current) => current.map((line, lineIndex) => (lineIndex === index ? value : line)));
  }

  function addInclusion() {
    setInclusions((current) => [...current, '']);
  }

  function removeInclusion(index: number) {
    setInclusions((current) => (current.length === 1 ? [''] : current.filter((_, lineIndex) => lineIndex !== index)));
  }

  return (
    <Modal animationType="none" onRequestClose={onClose} visible={visible}>
      <CatalogFormLayout
        closeLabel="Close package form"
        formError={formError}
        isSaving={isSaving}
        onClose={onClose}
        onSave={handleSave}
        saveLabel="Save Package"
        title={item ? 'Edit Package' : 'Add New Package'}
        visible={visible}>
        <View style={formStyles.sectionCard}>
          {isCategoryLocked ? (
            <View style={formStyles.field}>
              <Text style={formStyles.label}>Category</Text>
              <View style={formStyles.lockedInput}>
                <Text style={formStyles.inputText}>{selectedService?.name ?? 'Selected category'}</Text>
              </View>
            </View>
          ) : (
            <View style={formStyles.dropdownField}>
              <Text style={formStyles.label}>Select Category <Text style={formStyles.required}>*</Text></Text>
              <Pressable
                accessibilityLabel="Select Category"
                accessibilityRole="button"
                accessibilityState={{ expanded: isCategoryPickerOpen }}
                onPress={() => setIsCategoryPickerOpen((value) => !value)}
                style={({ pressed }) => [formStyles.selectInput, isCategoryPickerOpen && formStyles.selectInputOpen, pressed && formStyles.pressed]}>
                <Text style={formStyles.inputText}>{selectedService?.name ?? 'Select category'}</Text>
                <View style={isCategoryPickerOpen && formStyles.chevronOpen}><ChevronDownIcon /></View>
              </Pressable>
              {isCategoryPickerOpen ? (
                <View style={formStyles.categoryList}>
                  <ScrollView bounces={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled style={formStyles.categoryMenu}>
                    {services.map((service) => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: serviceId === service.id }}
                        key={service.id}
                        onPress={() => {
                          setServiceId(service.id);
                          setIsCategoryPickerOpen(false);
                        }}
                        style={[formStyles.categoryOption, serviceId === service.id && formStyles.activeCategoryOption]}>
                        <Text style={[formStyles.categoryText, serviceId === service.id && formStyles.activeCategoryText]}>
                          {service.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
            </View>
          )}

          <FormInput label="Service Name" onChangeText={setName} required value={name} />
          <FormInput keyboardType="numeric" label="Price" onChangeText={setPriceAmount} required value={priceAmount} />
          <FormInput label="Badge" onChangeText={setBadge} value={badge} />
        </View>
        <View style={formStyles.sectionCard}>
          <ImagePickerField
            fallbackSource={item?.image}
            imageUrl={item?.imageUrl}
            label="Add Package Photo"
            pickedImage={pickedImage}
            onPick={setPickedImage}
          />
        </View>
        <View style={formStyles.sectionCard}>
          <View style={formStyles.inclusionsHeader}>
            <Text style={[formStyles.label, formStyles.inclusionsLabel]}>Inclusions</Text>
            <Pressable accessibilityLabel="Add inclusion" accessibilityRole="button" onPress={addInclusion} style={({ pressed }) => [formStyles.iconButton, pressed && formStyles.pressed]}>
              <PlusIcon />
            </Pressable>
          </View>
          {inclusions.map((inclusion, index) => (
            <View key={index} style={formStyles.inclusionRow}>
              <TextInput
                accessibilityLabel={`Package inclusion ${index + 1}`}
                onChangeText={(value) => updateInclusion(index, value)}
                placeholder="Package inclusion"
                placeholderTextColor="#8AA3C3"
                style={formStyles.inclusionInput}
                value={inclusion}
              />
              <Pressable accessibilityLabel="Remove inclusion" accessibilityRole="button" onPress={() => removeInclusion(index)} style={({ pressed }) => [formStyles.removeInclusionButton, pressed && formStyles.pressed]}>
                <MinusIcon />
              </Pressable>
            </View>
          ))}

          <ActiveToggle isActive={isActive} onPress={() => setIsActive((value) => !value)} />
        </View>
      </CatalogFormLayout>
    </Modal>
  );
}

function CatalogFormLayout({
  children,
  closeLabel,
  formError,
  isSaving,
  onClose,
  onSave,
  saveLabel,
  title,
  visible,
}: {
  children: ReactNode;
  closeLabel: string;
  formError: string | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: () => void;
  saveLabel: string;
  title: string;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (formError) scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [formError]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
      style={formStyles.screen}>
      {visible ? <StatusBar style="dark" /> : null}
      <View style={[formStyles.header, { paddingTop: insets.top + 16, paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16) }]}>
        <Pressable accessibilityLabel={closeLabel} accessibilityRole="button" onPress={onClose} style={({ pressed }) => [formStyles.backButton, pressed && formStyles.pressed]}>
          <ServiceBackIcon />
        </Pressable>
        <Text accessibilityRole="header" style={formStyles.headerTitle}>{title}</Text>
      </View>
      <ScrollView
        ref={scrollRef}
        bounces={false}
        contentContainerStyle={[formStyles.scrollContent, { paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}>
        {formError ? <FormError message={formError} /> : null}
        {children}
      </ScrollView>
      <View style={[formStyles.footer, { paddingBottom: Math.max(insets.bottom, 16), paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16) }]}>
        <FormActions isSaving={isSaving} onCancel={onClose} onSave={onSave} saveLabel={saveLabel} />
      </View>
    </KeyboardAvoidingView>
  );
}

function ImagePickerField({
  fallbackSource,
  imageUrl,
  label,
  onPick,
  pickedImage,
}: {
  fallbackSource?: PackageCatalogItem['image'];
  imageUrl?: string | null;
  label: string;
  onPick: (image: ImagePicker.ImagePickerAsset) => void;
  pickedImage: ImagePicker.ImagePickerAsset | null;
}) {
  const previewSource = pickedImage?.uri ? { uri: pickedImage.uri } : imageUrl ? { uri: imageUrl } : fallbackSource;

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      showAppAlert('Permission needed', 'Please allow PhotoSync to choose images from your gallery.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [4, 3],
      mediaTypes: ['images'],
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      onPick(result.assets[0]);
    }
  }

  return (
    <View>
      <Text style={formStyles.label}>{label}</Text>
      <View style={formStyles.photoRow}>
        <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={pickImage} style={({ pressed }) => [formStyles.photoBox, previewSource && formStyles.photoBoxWithPreview, pressed && formStyles.pressed]}>
          {previewSource ? (
            <>
              <Image contentFit="cover" source={previewSource} style={formStyles.photoPreview} />
              <View pointerEvents="none" style={formStyles.photoEditBadge}><CameraIcon /></View>
            </>
          ) : (
            <>
              <CameraIcon />
              <Text style={formStyles.photoText}>
                Drop your image here, or <Text style={formStyles.browseText}>browse</Text>
              </Text>
            </>
          )}
        </Pressable>
      </View>
      <Text style={formStyles.hint}>JPG or PNG works best.</Text>
    </View>
  );
}

function FormInput({
  compact = false,
  keyboardType,
  label,
  multiline = false,
  onChangeText,
  required = false,
  value,
}: {
  compact?: boolean;
  keyboardType?: 'default' | 'numeric';
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  return (
    <View style={[formStyles.field, compact && formStyles.compactField]}>
      <Text style={formStyles.label}>{label} {required ? <Text style={formStyles.required}>*</Text> : null}</Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholderTextColor={adminColors.muted}
        style={[formStyles.input, multiline && formStyles.textarea]}
        value={value}
      />
    </View>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <View accessibilityRole="alert" style={formStyles.errorBox}>
      <Text style={formStyles.errorText}>{message}</Text>
    </View>
  );
}

function ActiveToggle({ isActive, onPress }: { isActive: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={isActive ? 'Active' : 'Inactive'} accessibilityRole="switch" accessibilityState={{ checked: isActive }} onPress={onPress} style={({ pressed }) => [formStyles.activeRow, pressed && formStyles.pressed]}>
      <View style={[formStyles.activeSwitchTrack, isActive && formStyles.activeSwitchTrackOn]}>
        <View style={[formStyles.activeSwitchThumb, isActive && formStyles.activeSwitchThumbOn]} />
      </View>
      <Text style={formStyles.activeText}>{isActive ? 'Active' : 'Inactive'}</Text>
    </Pressable>
  );
}

function FormActions({
  isSaving = false,
  onCancel,
  onSave,
  saveLabel,
}: {
  isSaving?: boolean;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <View style={formStyles.actionRow}>
      <Pressable accessibilityRole="button" onPress={onCancel} style={({ pressed }) => [formStyles.cancelButton, pressed && formStyles.pressed]}>
        <Text style={formStyles.cancelText}>Cancel</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ busy: isSaving, disabled: isSaving }} disabled={isSaving} onPress={onSave} style={({ pressed }) => [formStyles.saveButton, (isSaving || pressed) && formStyles.pressed]}>
        {isSaving ? <ActivityIndicator color={adminColors.surface} size="small" /> : null}
        <Text style={formStyles.saveText}>{isSaving ? 'Saving...' : saveLabel}</Text>
      </Pressable>
    </View>
  );
}

async function uploadPickedImage(pickedImage: ImagePicker.ImagePickerAsset | null) {
  if (!pickedImage) {
    return null;
  }

  const result = await uploadCatalogImage({
    fileName: pickedImage.fileName,
    mimeType: pickedImage.mimeType,
    uri: pickedImage.uri,
  });

  if (!result.success) {
    return false;
  }

  return result.publicUrl;
}

function toSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function formatDurationHours(durationMinutes: number) {
  const hours = Math.floor(durationMinutes / 60);

  return hours > 0 ? String(hours) : '';
}

function formatDurationMinutes(durationMinutes: number) {
  const minutes = durationMinutes % 60;

  return minutes > 0 ? String(minutes) : '';
}

function getDurationTotalMinutes(hoursValue: string, minutesValue: string) {
  const hours = Number(hoursValue || 0);
  const minutes = Number(minutesValue || 0);
  const totalMinutes = Math.round(hours * 60) + Math.round(minutes);

  return totalMinutes > 0 ? totalMinutes : null;
}

function formatPackageCount(count: number) {
  return `${count} ${count === 1 ? 'package' : 'packages'}`;
}

function ServiceBackIcon() {
  return (
    <Svg width={35} height={35} viewBox="0 0 35 35" fill="none">
      <Path d="M21.9 7.3L11.7 17.5L21.9 27.7" stroke="#083979" strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} />
    </Svg>
  );
}

function ServiceEditIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M4.5 17.8L5.6 13.7L16 3.3C17 2.3 18.5 2.3 19.5 3.3L20.7 4.5C21.7 5.5 21.7 7 20.7 8L10.3 18.4L6.2 19.5C5.1 19.8 4.2 18.9 4.5 17.8Z" fill="#142C4C" />
    </Svg>
  );
}

function ServiceDeleteIcon() {
  return (
    <Svg width={30} height={30} viewBox="0 0 30 30" fill="none">
      <Path d="M8.8 10.3H21.2L20.2 24.2C20.1 25.2 19.3 26 18.2 26H11.8C10.7 26 9.9 25.2 9.8 24.2L8.8 10.3Z" fill="#D71920" />
      <Path d="M7 7.8H23" stroke="#D71920" strokeLinecap="round" strokeWidth={2.6} />
      <Path d="M12.3 7.8V5.8C12.3 4.8 13.1 4 14.1 4H15.9C16.9 4 17.7 4.8 17.7 5.8V7.8" stroke="#D71920" strokeLinecap="round" strokeWidth={2.6} />
      <Path d="M13.1 13.6V22M16.9 13.6V22" stroke="#ffffff" strokeLinecap="round" strokeWidth={1.9} />
    </Svg>
  );
}

function ChevronDownIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M5 7.5L10 12.5L15 7.5" stroke="#4C5E76" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
    </Svg>
  );
}

function PlusIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path d="M9 3.5V14.5M3.5 9H14.5" stroke="#ffffff" strokeLinecap="round" strokeWidth={2.3} />
    </Svg>
  );
}

function MinusIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path d="M4 9H14" stroke="#142C4C" strokeLinecap="round" strokeWidth={2.3} />
    </Svg>
  );
}

function EmptyPackagesIcon() {
  return (
    <Svg width={58} height={58} viewBox="0 0 58 58" fill="none">
      <Circle cx={29} cy={29} r={29} fill="#E4EEFC" />
      <Path d="M18 23.5C18 21.6 19.6 20 21.5 20H36.5C38.4 20 40 21.6 40 23.5V38C40 39.1 39.1 40 38 40H20C18.9 40 18 39.1 18 38V23.5Z" stroke="#142C4C" strokeWidth={2.4} />
      <Path d="M23 20V18.5C23 17.1 24.1 16 25.5 16H32.5C33.9 16 35 17.1 35 18.5V20" stroke="#142C4C" strokeLinecap="round" strokeWidth={2.4} />
      <Path d="M24 28H34M24 33H31" stroke="#8AA3C3" strokeLinecap="round" strokeWidth={2.4} />
    </Svg>
  );
}

function CameraIcon() {
  return (
    <Svg width={31} height={25} viewBox="0 0 31 25" fill="none">
      <Path d="M27.2 6.1H22.4L21.2 3.2C21 2.7 20.5 2.3 19.9 2.3H11.1C10.5 2.3 10 2.7 9.8 3.2L8.6 6.1H3.8C2.5 6.1 1.5 7.1 1.5 8.4V21.1C1.5 22.4 2.5 23.4 3.8 23.4H27.2C28.5 23.4 29.5 22.4 29.5 21.1V8.4C29.5 7.1 28.5 6.1 27.2 6.1Z" stroke="#142C4C" strokeLinejoin="round" strokeWidth={2.2} />
      <Circle cx={15.5} cy={14.8} r={5.1} stroke="#142C4C" strokeWidth={2.2} />
    </Svg>
  );
}
