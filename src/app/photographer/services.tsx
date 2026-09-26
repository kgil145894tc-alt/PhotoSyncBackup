import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { fallbackPortraitPackages, fallbackServices } from '@/data/service-catalog';
import {
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
  const [packages, setPackages] = useState<PackageCatalogItem[]>(fallbackPortraitPackages);
  const [services, setServices] = useState<ServiceCatalogItem[]>(fallbackServices);
  const bottomPadding = bottomNavMetrics.height + insets.bottom + 24;

  async function refreshCatalog() {
    const [serviceItems, packageItems] = await Promise.all([
      getAdminServicesCatalog(),
      getAdminPackagesCatalog(),
    ]);

    setServices(serviceItems);
    setPackages(packageItems);
  }

  useEffect(() => {
    let isMounted = true;

    Promise.all([getAdminServicesCatalog(), getAdminPackagesCatalog()]).then(([serviceItems, packageItems]) => {
      if (isMounted) {
        setServices(serviceItems);
        setPackages(packageItems);
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

    if (!services.length) {
      Alert.alert('Add a category first', 'Please create a service category before adding packages.');
      return;
    }

    setEditingPackage(null);
    setIsPackageFormVisible(true);
  }

  async function toggleService(service: ServiceCatalogItem) {
    const result = await setServiceActive(service.id, !service.isActive);

    if (!result.success) {
      Alert.alert('Service not updated', result.message ?? 'Please try again.');
      return;
    }

    await refreshCatalog();
  }

  async function togglePackage(item: PackageCatalogItem) {
    const result = await setPackageActive(item.id, !item.isActive);

    if (!result.success) {
      Alert.alert('Package not updated', result.message ?? 'Please try again.');
      return;
    }

    await refreshCatalog();
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.adminServicesContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.servicesHeaderRow}>
          <View style={styles.servicesHeaderCopy}>
            <Text style={styles.adminPageTitle}>Services</Text>
            <Text style={styles.adminPageSubtitle}>Manage your service categories and packages.</Text>
          </View>
          <Pressable
            accessibilityLabel={activeView === 'categories' ? 'Add service category' : 'Add package'}
            accessibilityRole="button"
            onPress={openAddForm}
            style={({ pressed }) => [styles.serviceAddButton, pressed && { opacity: 0.82 }]}>
            <PlusIcon />
            <Text style={styles.serviceAddText}>Add</Text>
          </Pressable>
        </View>

        <View style={styles.servicesSegmentedControl}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setActiveView('categories')}
            style={[styles.servicesSegment, activeView === 'categories' && styles.activeServicesSegment]}>
            <Text style={[styles.servicesSegmentText, activeView === 'categories' && styles.activeServicesSegmentText]}>
              Categories
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setActiveView('packages')}
            style={[styles.servicesSegment, activeView === 'packages' && styles.activeServicesSegment]}>
            <Text style={[styles.servicesSegmentText, activeView === 'packages' && styles.activeServicesSegmentText]}>
              Packages
            </Text>
          </Pressable>
        </View>

        <View style={styles.serviceCategoryList}>
          {activeView === 'categories'
            ? services.map((service, index) => (
                <AdminServiceItem
                  index={index}
                  key={service.id}
                  onEdit={() => {
                    setEditingService(service);
                    setIsServiceFormVisible(true);
                  }}
                  onToggle={() => toggleService(service)}
                  service={service}
                />
              ))
            : packages.map((item, index) => (
                <AdminPackageItem
                  index={index}
                  item={item}
                  key={item.id}
                  onEdit={() => {
                    setEditingPackage(item);
                    setIsPackageFormVisible(true);
                  }}
                  onToggle={() => togglePackage(item)}
                  serviceName={services.find((service) => service.id === item.serviceId)?.name ?? 'Service'}
                />
              ))}
        </View>
      </ScrollView>

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
        onClose={() => setIsPackageFormVisible(false)}
        onSaved={refreshCatalog}
        services={services}
        visible={isPackageFormVisible}
      />
    </View>
  );
}

function AdminServiceItem({
  index,
  onEdit,
  onToggle,
  service,
}: {
  index: number;
  onEdit: () => void;
  onToggle: () => void;
  service: ServiceCatalogItem;
}) {
  return (
    <View style={styles.serviceCategoryCard}>
      <View style={[styles.serviceCategoryThumb, thumbnailToneStyles[index % thumbnailToneStyles.length]]}>
        <Image contentFit="cover" source={service.image} style={styles.serviceThumbImage} />
      </View>
      <View style={styles.serviceCategoryCopy}>
        <Text style={styles.serviceCategoryName}>{service.name}</Text>
        <Text style={styles.serviceCategoryCount}>
          {formatPackageCount(service.packageCount)} | {service.isActive ? 'Active' : 'Inactive'}
        </Text>
      </View>
      <View style={styles.serviceManageActions}>
        <Pressable accessibilityRole="button" onPress={onEdit} style={styles.serviceManageButton}>
          <Text style={styles.serviceManageText}>Edit</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onToggle} style={styles.serviceManageButton}>
          <Text style={styles.serviceManageText}>{service.isActive ? 'Off' : 'On'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AdminPackageItem({
  index,
  item,
  onEdit,
  onToggle,
  serviceName,
}: {
  index: number;
  item: PackageCatalogItem;
  onEdit: () => void;
  onToggle: () => void;
  serviceName: string;
}) {
  return (
    <View style={styles.serviceCategoryCard}>
      <View style={[styles.serviceCategoryThumb, thumbnailToneStyles[index % thumbnailToneStyles.length]]}>
        <Image contentFit="cover" source={item.image} style={styles.serviceThumbImage} />
      </View>
      <View style={styles.serviceCategoryCopy}>
        <Text style={styles.serviceCategoryName}>{item.name}</Text>
        <Text style={styles.serviceCategoryCount}>
          {item.price} | {serviceName} | {item.isActive ? 'Active' : 'Inactive'}
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
  const [basePrice, setBasePrice] = useState(service ? String(service.basePrice) : '');
  const [bufferMinutes, setBufferMinutes] = useState(service?.bufferMinutes ? String(service.bufferMinutes) : '30');
  const [description, setDescription] = useState(service?.description ?? '');
  const [durationHours, setDurationHours] = useState(service?.durationMinutes ? formatDurationHours(service.durationMinutes) : '');
  const [isActive, setIsActive] = useState(service?.isActive ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [minimumNoticeDays, setMinimumNoticeDays] = useState(service?.minimumNoticeDays ? String(service.minimumNoticeDays) : '1');
  const [pickedImage, setPickedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [name, setName] = useState(service?.name ?? '');
  const [slug, setSlug] = useState(service?.slug ?? '');

  async function handleSave() {
    if (isSaving) {
      return;
    }

    if (!name.trim()) {
      Alert.alert('Missing name', 'Please enter a service category name.');
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
      slug: slug.trim() || toSlug(name),
    };
    const result = await saveServiceCategory(formValues);

    if (!result.success) {
      setIsSaving(false);
      Alert.alert('Service not saved', result.message ?? 'Please try again.');
      return;
    }

    await onSaved();
    setIsSaving(false);
    onClose();
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.formOverlay}>
        <View style={styles.formSheet}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.formTitle}>{service ? 'Edit Service Category' : 'Add Service Category'}</Text>
            <FormInput label="Name" onChangeText={setName} value={name} />
            <FormInput label="Slug" onChangeText={setSlug} value={slug} />
            <FormInput label="Description" multiline onChangeText={setDescription} value={description} />
            <FormInput keyboardType="numeric" label="Base Price" onChangeText={setBasePrice} value={basePrice} />
            <FormInput keyboardType="numeric" label="Duration Hours" onChangeText={setDurationHours} value={durationHours} />
            <FormInput keyboardType="numeric" label="Preparation Time (minutes)" onChangeText={setBufferMinutes} value={bufferMinutes} />
            <FormInput keyboardType="numeric" label="Minimum Notice (days)" onChangeText={setMinimumNoticeDays} value={minimumNoticeDays} />
            <ImagePickerField
              fallbackSource={service?.image}
              imageUrl={service?.imageUrl}
              label="Service Image"
              pickedImage={pickedImage}
              onPick={setPickedImage}
            />
            <ActiveToggle isActive={isActive} onPress={() => setIsActive((value) => !value)} />
            <FormActions isSaving={isSaving} onCancel={onClose} onSave={handleSave} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PackageFormModal({
  item,
  onClose,
  onSaved,
  services,
  visible,
}: {
  item: PackageCatalogItem | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  services: ServiceCatalogItem[];
  visible: boolean;
}) {
  const [badge, setBadge] = useState(item?.badge ?? '');
  const [inclusions, setInclusions] = useState(item?.inclusions.join('\n') ?? '');
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState(item?.name ?? '');
  const [pickedImage, setPickedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [priceAmount, setPriceAmount] = useState(item ? String(item.priceAmount) : '');
  const [serviceId, setServiceId] = useState(item?.serviceId ?? services[0]?.id ?? '');

  async function handleSave() {
    if (isSaving) {
      return;
    }

    if (!name.trim() || !serviceId) {
      Alert.alert('Missing package details', 'Please enter a package name and choose a category.');
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
        .split('\n')
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
      Alert.alert('Package not saved', result.message ?? 'Please try again.');
      return;
    }

    await onSaved();
    setIsSaving(false);
    onClose();
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.formOverlay}>
        <View style={styles.formSheet}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.formTitle}>{item ? 'Edit Package' : 'Add Package'}</Text>
            <Text style={styles.formLabel}>Category</Text>
            <View style={styles.servicePickerList}>
              {services.map((service) => (
                <Pressable
                  accessibilityRole="button"
                  key={service.id}
                  onPress={() => setServiceId(service.id)}
                  style={[styles.servicePickerOption, serviceId === service.id && styles.activeServicePickerOption]}>
                  <Text style={[styles.servicePickerText, serviceId === service.id && styles.activeServicePickerText]}>
                    {service.name}
                  </Text>
                </Pressable>
              ))}
            </View>
            <FormInput label="Package Name" onChangeText={setName} value={name} />
            <FormInput keyboardType="numeric" label="Price" onChangeText={setPriceAmount} value={priceAmount} />
            <FormInput label="Badge" onChangeText={setBadge} value={badge} />
            <FormInput label="Inclusions (one per line)" multiline onChangeText={setInclusions} value={inclusions} />
            <ImagePickerField
              fallbackSource={item?.image}
              imageUrl={item?.imageUrl}
              label="Package Image"
              pickedImage={pickedImage}
              onPick={setPickedImage}
            />
            <ActiveToggle isActive={isActive} onPress={() => setIsActive((value) => !value)} />
            <FormActions isSaving={isSaving} onCancel={onClose} onSave={handleSave} />
          </ScrollView>
        </View>
      </View>
    </Modal>
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
      Alert.alert('Permission needed', 'Please allow PhotoSync to choose images from your gallery.');
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
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <View style={styles.imagePickerRow}>
        <View style={styles.imagePickerPreview}>
          {previewSource ? <Image contentFit="cover" source={previewSource} style={styles.imagePickerPreviewImage} /> : <CameraIcon />}
        </View>
        <Pressable accessibilityRole="button" onPress={pickImage} style={styles.imagePickerButton}>
          <Text style={styles.imagePickerButtonText}>{pickedImage ? 'Change Image' : 'Choose Image'}</Text>
        </Pressable>
      </View>
      <Text style={styles.imagePickerHint}>JPG or PNG works best.</Text>
    </View>
  );
}

function FormInput({
  keyboardType,
  label,
  multiline = false,
  onChangeText,
  value,
}: {
  keyboardType?: 'default' | 'numeric';
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        style={[styles.formInput, multiline && styles.formTextarea]}
        value={value}
      />
    </View>
  );
}

function ActiveToggle({ isActive, onPress }: { isActive: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: isActive }} onPress={onPress} style={styles.activeToggleRow}>
      <View style={[styles.activeToggleBox, isActive && styles.activeToggleBoxOn]} />
      <Text style={styles.activeToggleText}>{isActive ? 'Active' : 'Inactive'}</Text>
    </Pressable>
  );
}

function FormActions({ isSaving = false, onCancel, onSave }: { isSaving?: boolean; onCancel: () => void; onSave: () => void }) {
  return (
    <View style={styles.formActions}>
      <Pressable accessibilityRole="button" onPress={onCancel} style={styles.formCancelButton}>
        <Text style={styles.formCancelText}>Cancel</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={isSaving} onPress={onSave} style={[styles.formSaveButton, isSaving && { opacity: 0.72 }]}>
        <Text style={styles.formSaveText}>{isSaving ? 'Saving...' : 'Save'}</Text>
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
    Alert.alert('Image not uploaded', result.message ?? 'Please check your Supabase Storage setup.');
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

function PlusIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5V19M5 12H19" stroke="#ffffff" strokeLinecap="round" strokeWidth={2.5} />
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
