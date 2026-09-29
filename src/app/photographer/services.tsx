import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { showAppAlert } from '@/components/app-alert';
import { AdminBrandHeader } from '@/components/admin-brand-header';
import {
  getCachedAdminPackagesCatalog,
  getCachedAdminServicesCatalog,
  getAdminPackagesCatalog,
  getAdminServicesCatalog,
  saveServiceCategory,
  saveServicePackage,
  setPackageActive,
  setServiceActive,
  type PackageFormValues,
  type ServiceFormValues,
  uploadCatalogImage,
} from '@/services/service-catalog';
import { bottomNavMetrics } from '@/styles/navigation.styles';
import { photographerStyles as styles } from '@/styles/photographer.styles';
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
  const insets = useSafeAreaInsets();
  const [activeView, setActiveView] = useState<ActiveView>('categories');
  const [editingPackage, setEditingPackage] = useState<PackageCatalogItem | null>(null);
  const [editingService, setEditingService] = useState<ServiceCatalogItem | null>(null);
  const [isPackageFormVisible, setIsPackageFormVisible] = useState(false);
  const [isServiceFormVisible, setIsServiceFormVisible] = useState(false);
  const [isDeletingPackage, setIsDeletingPackage] = useState(false);
  const [isDeletingService, setIsDeletingService] = useState(false);
  const [pendingDeletePackage, setPendingDeletePackage] = useState<PackageCatalogItem | null>(null);
  const [pendingDeleteService, setPendingDeleteService] = useState<ServiceCatalogItem | null>(null);
  const [packages, setPackages] = useState<PackageCatalogItem[]>(() => getCachedAdminPackagesCatalog() ?? []);
  const [selectedServiceId, setSelectedServiceId] = useState(() => getCachedAdminServicesCatalog()?.find((service) => service.isActive)?.id ?? '');
  const [services, setServices] = useState<ServiceCatalogItem[]>(() => getCachedAdminServicesCatalog() ?? []);
  const bottomPadding = bottomNavMetrics.height + insets.bottom + 24;
  const activeServices = services.filter((service) => service.isActive);
  const selectedService = activeServices.find((service) => service.id === selectedServiceId) ?? activeServices[0] ?? null;
  const visiblePackages = packages.filter((item) => item.isActive && (!selectedService?.id || item.serviceId === selectedService.id));

  async function refreshCatalog() {
    const [serviceItems, packageItems] = await Promise.all([
      getAdminServicesCatalog(),
      getAdminPackagesCatalog(),
    ]);

    setServices(serviceItems);
    setPackages(packageItems);
    setSelectedServiceId((currentId) => (
      serviceItems.some((service) => service.isActive && service.id === currentId)
        ? currentId
        : serviceItems.find((service) => service.isActive)?.id ?? ''
    ));
  }

  useEffect(() => {
    let isMounted = true;

    Promise.all([getAdminServicesCatalog(), getAdminPackagesCatalog()]).then(([serviceItems, packageItems]) => {
      if (isMounted) {
        setServices(serviceItems);
        setPackages(packageItems);
        setSelectedServiceId((currentId) => (
          serviceItems.some((service) => service.isActive && service.id === currentId)
            ? currentId
            : serviceItems.find((service) => service.isActive)?.id ?? ''
        ));
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  function openAddForm() {
    if (activeView === 'categories') {
      setEditingService(null);
      setIsServiceFormVisible(true);
      return;
    }

    if (!activeServices.length) {
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

    const result = await setServiceActive(pendingDeleteService.id, false);

    if (!result.success) {
      setIsDeletingService(false);
      showAppAlert('Service not deleted', result.message ?? 'Please try again.');
      return;
    }

    const deletedServiceId = pendingDeleteService.id;

    setServices((currentServices) => {
      const nextServices = currentServices.map((item) => (
        item.id === deletedServiceId ? { ...item, isActive: false } : item
      ));

      setSelectedServiceId((currentId) => (
        currentId === deletedServiceId
          ? nextServices.find((item) => item.isActive && item.id !== deletedServiceId)?.id ?? ''
          : currentId
      ));

      return nextServices;
    });

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

    const result = await setPackageActive(pendingDeletePackage.id, false);

    if (!result.success) {
      setIsDeletingPackage(false);
      showAppAlert('Package not updated', result.message ?? 'Please try again.');
      return;
    }

    const deletedPackageId = pendingDeletePackage.id;

    setPackages((currentPackages) => currentPackages.map((item) => (
      item.id === deletedPackageId ? { ...item, isActive: false } : item
    )));
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
          { paddingBottom: bottomPadding },
        ]}>
        <Image
          contentFit="cover"
          source={require('@/assets/images/admin-calendar-background.png')}
          style={styles.servicesFigmaBackground}
        />
        {activeView === 'packages' ? (
          <>
            <View style={styles.servicesPackageHeader}>
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
                <Text style={styles.servicesPackageCount}>{formatPackageCount(selectedService?.packageCount ?? visiblePackages.length)}</Text>
              </View>
              <Pressable
                accessibilityLabel="Add package"
                accessibilityRole="button"
                onPress={openAddForm}
                style={({ pressed }) => [styles.servicesFigmaAddButton, pressed && { opacity: 0.84 }]}>
                <Text style={styles.servicesFigmaAddText}>+</Text>
              </Pressable>
            </View>

            <ScrollView
              bounces={false}
              contentContainerStyle={styles.servicesPackageList}
              showsVerticalScrollIndicator={false}
              style={styles.servicesFigmaListScroller}>
              {visiblePackages.length ? (
                visiblePackages.map((item) => (
                  <AdminPackageItem
                    item={item}
                    key={item.id}
                    onEdit={() => {
                      setEditingPackage(item);
                      setIsPackageFormVisible(true);
                    }}
                    onToggle={() => deletePackage(item)}
                    variant="figma"
                  />
                ))
              ) : (
                <View style={styles.servicesEmptyPackagesCard}>
                  <EmptyPackagesIcon />
                  <Text style={styles.servicesEmptyPackagesTitle}>No packages yet</Text>
                  <Text style={styles.servicesEmptyPackagesText}>Add a package for this service to show it here.</Text>
                </View>
              )}
            </ScrollView>
          </>
        ) : (
          <>
            <View style={styles.servicesCategoryIntro}>
              <Text style={styles.servicesCategoryTitle}>Services</Text>
              <Text style={styles.servicesCategorySubtitle}>Manage your service categories and packages.</Text>
              <Pressable
                accessibilityLabel="Show packages"
                accessibilityRole="button"
                onPress={openAddForm}
                style={({ pressed }) => [styles.servicesCategoryAddButton, pressed && { opacity: 0.84 }]}>
                <Text style={styles.servicesCategoryAddText}>+ Add</Text>
              </Pressable>
            </View>

            <ScrollView
              bounces={false}
              contentContainerStyle={styles.servicesCategoryFigmaList}
              showsVerticalScrollIndicator={false}
              style={styles.servicesFigmaListScroller}>
              {activeServices.map((service) => (
                <AdminServiceItem
                  key={service.id}
                  onDelete={() => deleteService(service)}
                  onEdit={() => {
                    setEditingService(service);
                    setIsServiceFormVisible(true);
                  }}
                  onOpen={() => {
                    setSelectedServiceId(service.id);
                    setActiveView('packages');
                  }}
                  service={service}
                />
              ))}
            </ScrollView>
          </>
        )}
      </View>

      <ServiceFormModal
        key={`service-${editingService?.id ?? 'new'}-${isServiceFormVisible}`}
        onClose={() => setIsServiceFormVisible(false)}
        onSaved={refreshCatalog}
        service={editingService}
        visible={isServiceFormVisible}
      />
      <PackageFormModal
        item={editingPackage}
        key={`package-${editingPackage?.id ?? 'new'}-${isPackageFormVisible}`}
        lockedServiceId={activeView === 'packages' ? selectedService?.id ?? null : null}
        onClose={() => setIsPackageFormVisible(false)}
        onSaved={refreshCatalog}
        services={activeServices}
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
              ? `This will remove ${packageItem.name} from this service. Packages with existing bookings cannot be deleted.`
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
              ? `This will remove ${service.name} from your active services. Services with existing bookings cannot be deleted.`
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
      <Pressable accessibilityRole="button" onPress={onOpen} style={styles.servicesCategoryFigmaOpenArea}>
        <Image contentFit="cover" source={service.image} style={styles.servicesCategoryFigmaImage} />
        <View style={styles.servicesCategoryFigmaCopy}>
          <Text numberOfLines={1} style={styles.servicesCategoryFigmaName}>{service.name}</Text>
          <Text style={styles.servicesCategoryFigmaCount}>{formatServiceCount(service.packageCount)}</Text>
        </View>
      </Pressable>
      <View style={styles.servicesCategoryFigmaActions}>
        <Pressable accessibilityLabel={`Edit ${service.name}`} accessibilityRole="button" hitSlop={8} onPress={onEdit}>
          <ServiceEditIcon />
        </Pressable>
        <Pressable accessibilityLabel={`Delete ${service.name}`} accessibilityRole="button" hitSlop={8} onPress={onDelete}>
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
          <Text numberOfLines={1} style={styles.servicesPackageName}>{item.name}</Text>
          <Text style={styles.servicesPackagePrice}>{item.price}</Text>
          <View style={styles.servicesInclusionList}>
            {item.inclusions.slice(0, 6).map((inclusion, index) => (
              <View key={`${item.id}-${index}`} style={styles.servicesInclusionRow}>
                <View style={styles.servicesInclusionDot} />
                <Text numberOfLines={1} style={styles.servicesInclusionText}>{inclusion}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.servicesPackageActions}>
          <Pressable accessibilityLabel="Edit package" accessibilityRole="button" hitSlop={8} onPress={onEdit}>
            <ServiceEditIcon />
          </Pressable>
          <Pressable accessibilityLabel={item.isActive ? 'Deactivate package' : 'Activate package'} accessibilityRole="button" hitSlop={8} onPress={onToggle}>
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
          <Text style={styles.serviceManageText}>{item.isActive ? 'Off' : 'On'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ServiceFormModal({
  onClose,
  onSaved,
  service,
  visible,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  service: ServiceCatalogItem | null;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();
  const [basePrice, setBasePrice] = useState(service ? String(service.basePrice) : '');
  const [bufferMinutes, setBufferMinutes] = useState(service?.bufferMinutes ? String(service.bufferMinutes) : '30');
  const [description, setDescription] = useState(service?.description ?? '');
  const [durationHours, setDurationHours] = useState(service?.durationMinutes ? formatDurationHours(service.durationMinutes) : '');
  const [isActive, setIsActive] = useState(service?.isActive ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [minimumNoticeDays, setMinimumNoticeDays] = useState(service?.minimumNoticeDays ? String(service.minimumNoticeDays) : '1');
  const [pickedImage, setPickedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [name, setName] = useState(service?.name ?? '');

  async function handleSave() {
    if (isSaving) {
      return;
    }

    if (!name.trim()) {
      showAppAlert('Missing name', 'Please enter a service category name.');
      return;
    }

    const generatedSlug = toSlug(name);

    if (!generatedSlug) {
      showAppAlert('Invalid name', 'Please use letters or numbers in the service category name.');
      return;
    }

    setIsSaving(true);

    const uploadedImageUrl = await uploadPickedImage(pickedImage);

    if (uploadedImageUrl === false) {
      setIsSaving(false);
      return;
    }

    const formValues: ServiceFormValues = {
      basePrice: Number(basePrice || 0),
      bufferMinutes: bufferMinutes ? Math.round(Number(bufferMinutes)) : 0,
      description,
      durationMinutes: durationHours ? Math.round(Number(durationHours) * 60) : null,
      id: service?.id,
      imageUrl: uploadedImageUrl ?? service?.imageUrl ?? null,
      isActive,
      minimumNoticeDays: minimumNoticeDays ? Math.round(Number(minimumNoticeDays)) : 0,
      name,
      slug: generatedSlug,
    };
    const result = await saveServiceCategory(formValues);

    if (!result.success) {
      setIsSaving(false);
      showAppAlert('Service not saved', result.message ?? 'Please try again.');
      return;
    }

    await onSaved();
    setIsSaving(false);
    onClose();
  }

  return (
    <Modal animationType="none" onRequestClose={onClose} visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        style={formStyles.screen}>
        <Image
          contentFit="cover"
          source={require('@/assets/images/admin-calendar-background.png')}
          style={formStyles.background}
        />
        <ScrollView
          bounces={false}
          contentContainerStyle={[
            formStyles.scrollContent,
            {
              paddingBottom: isKeyboardVisible ? insets.bottom + 160 : insets.bottom + 56,
              paddingTop: insets.top + 26,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}>
          <View style={formStyles.header}>
            <Pressable accessibilityLabel="Close service form" accessibilityRole="button" hitSlop={10} onPress={onClose} style={formStyles.backButton}>
              <ServiceBackIcon />
            </Pressable>
            <Text style={formStyles.headerTitle}>{service ? 'Edit Service' : 'Add New Service'}</Text>
          </View>

          <FormInput label="Service Name" onChangeText={setName} required value={name} />
          <FormInput label="Description" multiline onChangeText={setDescription} value={description} />
          <FormInput keyboardType="numeric" label="Base Price" onChangeText={setBasePrice} required value={basePrice} />
          <FormInput keyboardType="numeric" label="Duration Hours" onChangeText={setDurationHours} value={durationHours} />
          <FormInput keyboardType="numeric" label="Preparation Time (minutes)" onChangeText={setBufferMinutes} value={bufferMinutes} />
          <FormInput keyboardType="numeric" label="Minimum Notice (days)" onChangeText={setMinimumNoticeDays} value={minimumNoticeDays} />
          <ImagePickerField
            fallbackSource={service?.image}
            imageUrl={service?.imageUrl}
            label="Add Photo"
            pickedImage={pickedImage}
            onPick={setPickedImage}
          />
          <ActiveToggle isActive={isActive} onPress={() => setIsActive((value) => !value)} />
          <FormActions isSaving={isSaving} onCancel={onClose} onSave={handleSave} saveLabel="Save Service" />
        </ScrollView>
      </KeyboardAvoidingView>
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
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();
  const [badge, setBadge] = useState(item?.badge ?? '');
  const [inclusions, setInclusions] = useState(item?.inclusions.length ? item.inclusions : ['']);
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

    if (!name.trim() || !serviceId) {
      showAppAlert('Missing package details', 'Please enter a package name and choose a category.');
      return;
    }

    setIsSaving(true);

    const uploadedImageUrl = await uploadPickedImage(pickedImage);

    if (uploadedImageUrl === false) {
      setIsSaving(false);
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

    if (!result.success) {
      setIsSaving(false);
      showAppAlert('Package not saved', result.message ?? 'Please try again.');
      return;
    }

    await onSaved();
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        style={formStyles.screen}>
        <Image
          contentFit="cover"
          source={require('@/assets/images/admin-calendar-background.png')}
          style={formStyles.background}
        />
        <ScrollView
          bounces={false}
          contentContainerStyle={[
            formStyles.scrollContent,
            {
              paddingBottom: isKeyboardVisible ? insets.bottom + 180 : insets.bottom + 56,
              paddingTop: insets.top + 26,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}>
          <View style={formStyles.header}>
            <Pressable accessibilityLabel="Close package form" accessibilityRole="button" hitSlop={10} onPress={onClose} style={formStyles.backButton}>
              <ServiceBackIcon />
            </Pressable>
            <Text style={formStyles.headerTitle}>{item ? 'Edit Package' : 'Add New Package'}</Text>
          </View>

          {isCategoryLocked ? (
            <View style={formStyles.field}>
              <Text style={formStyles.label}>Category</Text>
              <View style={formStyles.lockedInput}>
                <Text numberOfLines={1} style={formStyles.inputText}>{selectedService?.name ?? 'Selected category'}</Text>
              </View>
            </View>
          ) : (
            <View style={formStyles.dropdownField}>
              <Text style={formStyles.label}>Select Category <Text style={formStyles.required}>*</Text></Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsCategoryPickerOpen((value) => !value)}
                style={formStyles.selectInput}>
                <Text numberOfLines={1} style={formStyles.inputText}>{selectedService?.name ?? 'Select category'}</Text>
                <ChevronDownIcon />
              </Pressable>
              {isCategoryPickerOpen ? (
                <View style={formStyles.categoryList}>
                  <ScrollView bounces={false} nestedScrollEnabled style={formStyles.categoryMenu}>
                    {services.map((service) => (
                      <Pressable
                        accessibilityRole="button"
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
          <ImagePickerField
            fallbackSource={item?.image}
            imageUrl={item?.imageUrl}
            label="Add Package Photo"
            pickedImage={pickedImage}
            onPick={setPickedImage}
          />

          <View style={formStyles.inclusionsHeader}>
            <Text style={formStyles.label}>Inclusions</Text>
            <Pressable accessibilityLabel="Add inclusion" accessibilityRole="button" onPress={addInclusion} style={formStyles.iconButton}>
              <PlusIcon />
            </Pressable>
          </View>
          {inclusions.map((inclusion, index) => (
            <View key={index} style={formStyles.inclusionRow}>
              <TextInput
                onChangeText={(value) => updateInclusion(index, value)}
                placeholder="Package inclusion"
                placeholderTextColor="#8AA3C3"
                style={formStyles.inclusionInput}
                value={inclusion}
              />
              <Pressable accessibilityLabel="Remove inclusion" accessibilityRole="button" onPress={() => removeInclusion(index)} style={formStyles.removeInclusionButton}>
                <MinusIcon />
              </Pressable>
            </View>
          ))}

          <ActiveToggle isActive={isActive} onPress={() => setIsActive((value) => !value)} />
          <FormActions isSaving={isSaving} onCancel={onClose} onSave={handleSave} saveLabel="Save Package" />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function useKeyboardVisible() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setIsKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return isKeyboardVisible;
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
        <Pressable accessibilityRole="button" onPress={pickImage} style={formStyles.photoBox}>
          {previewSource ? (
            <Image contentFit="cover" source={previewSource} style={formStyles.photoPreview} />
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
  keyboardType,
  label,
  multiline = false,
  onChangeText,
  required = false,
  value,
}: {
  keyboardType?: 'default' | 'numeric';
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  return (
    <View style={formStyles.field}>
      <Text style={formStyles.label}>{label} {required ? <Text style={formStyles.required}>*</Text> : null}</Text>
      <TextInput
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholderTextColor="#8AA3C3"
        style={[formStyles.input, multiline && formStyles.textarea]}
        value={value}
      />
    </View>
  );
}

function ActiveToggle({ isActive, onPress }: { isActive: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: isActive }} onPress={onPress} style={formStyles.activeRow}>
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
      <Pressable accessibilityRole="button" onPress={onCancel} style={formStyles.cancelButton}>
        <Text style={formStyles.cancelText}>Cancel</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={isSaving} onPress={onSave} style={[formStyles.saveButton, isSaving && { opacity: 0.72 }]}>
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
    showAppAlert('Image not uploaded', result.message ?? 'Please check your Supabase Storage setup.');
    return false;
  }

  return result.publicUrl;
}

function toSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function formatDurationHours(durationMinutes: number) {
  const hours = durationMinutes / 60;

  return Number.isInteger(hours) ? String(hours) : String(Number(hours.toFixed(2)));
}

function formatPackageCount(count: number) {
  return `${count} ${count === 1 ? 'package' : 'packages'}`;
}

function formatServiceCount(count: number) {
  return `${count} ${count === 1 ? 'service' : 'services'}`;
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
