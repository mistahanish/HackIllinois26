import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useInspection } from '../context/InspectionContext';
import { evaluateInspectionImage, evaluationToStatus } from '../lib/geminiApi';
import { findPointById } from '../data/inspectionData';
import { supabase } from '../lib/supabase';

const { width: SW, height: SH } = Dimensions.get('window');
const CELL_SIZE = (SW - 32 - 8 * 2) / 3;

/**
 * PhotoCaptureScreen
 *
 * Props:
 *   pointId   — inspection point id
 *   onBack    — navigate back to inspection modal
 */
export default function PhotoCaptureScreen({ pointId, onBack }) {
  const { addPhoto, updatePhotoEvaluation, setStatus, state, inspectionDbId } = useInspection();
  const point = findPointById(pointId);
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [confirming, setConfirming] = useState(false);

  const requestAndPick = useCallback(async (useCamera) => {
    try {
      let result;
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Camera access is needed to take inspection photos.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.85,
          allowsEditing: false,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Photo library access is needed.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.85,
          allowsMultipleSelection: true,
          selectionLimit: 8,
        });
      }

      if (!result.canceled && result.assets?.length > 0) {
        const newPhotos = result.assets.map((a) => ({
          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          uri: a.uri,
        }));
        setPendingPhotos((prev) => [...prev, ...newPhotos]);
      }
    } catch (e) {
      Alert.alert('Error', `Could not access photos: ${e.message}`);
    }
  }, []);

  const removePending = useCallback((id) => {
    setPendingPhotos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const confirmAndUpload = useCallback(async () => {
    if (pendingPhotos.length === 0) return;
    setConfirming(true);

    for (const photo of pendingPhotos) {
      // 1. Add to local context immediately with processing=true
      addPhoto(pointId, photo);

      // 2. Save photo record to Supabase (fire-and-forget if no inspectionDbId yet)
      if (inspectionDbId) {
        supabase.from('inspection_photos').insert({
          inspection_id: inspectionDbId,
          point_id: pointId,
          client_photo_id: photo.id,
          processing: true,
        }).then(({ error }) => {
          if (error) console.warn('[DB] inspection_photos insert failed:', error.message);
          else console.log('[DB] inspection_photos saved:', photo.id);
        });
      }

      // 3. Fire-and-forget Gemini evaluation + Supabase saves
      (async () => {
        try {
          const evaluation = await evaluateInspectionImage(
            photo.uri,
            point?.imageType || 'general',
            point?.specificPrompt || ''
          );
          const autoStatus = evaluationToStatus(evaluation);

          // Update local context
          updatePhotoEvaluation(pointId, photo.id, evaluation, evaluation.description, autoStatus);

          // Save evaluation + upsert point result to Supabase
          if (inspectionDbId) {
            // Resolve the photo's DB UUID first
            const { data: photoRow } = await supabase
              .from('inspection_photos')
              .select('id')
              .eq('client_photo_id', photo.id)
              .single();

            if (photoRow?.id) {
              const { error: evalErr } = await supabase.from('photo_evaluations').insert({
                photo_id: photoRow.id,
                verdict: evaluation.verdict === 'pass' ? 'pass' : 'fail',
                description: evaluation.description || '',
                auto_status: autoStatus,
                issues: evaluation.issues || [],
                raw_runs: [],
                runs_succeeded: evaluation.issues != null ? 1 : 0,
                runs_attempted: 3,
              });
              if (evalErr) console.warn('[DB] photo_evaluations insert failed:', evalErr.message);
              else console.log('[DB] photo_evaluations saved for', photo.id);
            }

            // Upsert the inspection point result
            const pointData = findPointById(pointId);
            const { error: iprErr } = await supabase.from('inspection_point_results').upsert({
              inspection_id: inspectionDbId,
              point_id: pointId,
              point_label: pointData?.label || pointId,
              perspective_id: pointData?.perspectiveId || '',
              image_type: pointData?.imageType || 'general',
              status: autoStatus || 'pending',
              notes: evaluation.description || '',
            }, { onConflict: 'inspection_id,point_id', ignoreDuplicates: false });
            if (iprErr) console.warn('[DB] inspection_point_results upsert failed:', iprErr.message);
            else console.log('[DB] inspection_point_results upserted for', pointId);
          }
        } catch (e) {
          console.warn('[Gemini] evaluation failed for', photo.id, e.message);
          updatePhotoEvaluation(pointId, photo.id, null, '', null);
        }
      })();
    }

    setConfirming(false);
    setPendingPhotos([]);
    onBack && onBack();
  }, [pendingPhotos, pointId, point, addPhoto, updatePhotoEvaluation, inspectionDbId, onBack]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          {point?.label || 'Add Photos'}
        </Text>
        <View style={styles.topRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Reference image section */}
        <View style={styles.referenceSection}>
          <Text style={styles.sectionHeader}>REFERENCE EXAMPLE</Text>
          <View style={styles.referenceImageContainer}>
            {point?.referenceImage ? (
              <Image
                source={point.referenceImage}
                style={styles.referenceImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.referencePlaceholder}>
                <Text style={styles.referencePlaceholderIcon}>📷</Text>
                <Text style={styles.referencePlaceholderText}>
                  Reference image coming soon
                </Text>
              </View>
            )}
            <View style={styles.referenceOverlay}>
              <Text style={styles.referenceOverlayText}>
                Use this as a guide for framing your photo
              </Text>
            </View>
          </View>
          {point?.specificPrompt && (
            <View style={styles.guideCard}>
              <Text style={styles.guideLabel}>What to inspect:</Text>
              <Text style={styles.guideText}>{point.specificPrompt}</Text>
            </View>
          )}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Capture section */}
        <View style={styles.captureSection}>
          <Text style={styles.sectionHeader}>CAPTURE PHOTO</Text>

          {/* Camera / Gallery buttons */}
          <View style={styles.captureButtons}>
            <TouchableOpacity
              style={styles.captureButton}
              onPress={() => requestAndPick(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.captureButtonIcon}>📸</Text>
              <Text style={styles.captureButtonLabel}>Take Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.captureButton, styles.captureButtonSecondary]}
              onPress={() => requestAndPick(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.captureButtonIcon}>🖼</Text>
              <Text style={styles.captureButtonLabel}>Choose from Gallery</Text>
            </TouchableOpacity>
          </View>

          {/* Pending preview grid */}
          {pendingPhotos.length > 0 && (
            <View style={styles.pendingSection}>
              <Text style={styles.pendingHeader}>
                {pendingPhotos.length} photo{pendingPhotos.length > 1 ? 's' : ''} selected
              </Text>
              <View style={styles.pendingGrid}>
                {pendingPhotos.map((photo) => (
                  <View key={photo.id} style={styles.pendingCell}>
                    <Image source={{ uri: photo.uri }} style={styles.pendingThumb} />
                    <TouchableOpacity
                      style={styles.removeBadge}
                      onPress={() => removePending(photo.id)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Text style={styles.removeBadgeText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Confirm button */}
      {pendingPhotos.length > 0 && (
        <View style={styles.confirmBar}>
          <TouchableOpacity
            style={[styles.confirmButton, confirming && styles.confirmButtonDisabled]}
            onPress={confirmAndUpload}
            disabled={confirming}
            activeOpacity={0.85}
          >
            {confirming ? (
              <ActivityIndicator color="#1C1C1E" />
            ) : (
              <Text style={styles.confirmButtonText}>
                Confirm {pendingPhotos.length} Photo{pendingPhotos.length > 1 ? 's' : ''}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2C2E',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 64,
  },
  backArrow: {
    color: '#FFD60A',
    fontSize: 28,
    lineHeight: 28,
    marginTop: -2,
  },
  backLabel: {
    color: '#FFD60A',
    fontSize: 16,
    fontWeight: '500',
  },
  topTitle: {
    flex: 1,
    color: '#EBEBF5',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  topRight: {
    minWidth: 64,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  referenceSection: {
    padding: 16,
  },
  sectionHeader: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  referenceImageContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    height: SH * 0.28,
    backgroundColor: '#1C1C1E',
  },
  referenceImage: {
    width: '100%',
    height: '100%',
  },
  referencePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  referencePlaceholderIcon: {
    fontSize: 40,
    opacity: 0.4,
  },
  referencePlaceholderText: {
    color: '#636366',
    fontSize: 14,
  },
  referenceOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  referenceOverlayText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    textAlign: 'center',
  },
  guideCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderLeftWidth: 2,
    borderLeftColor: '#FFD60A',
  },
  guideLabel: {
    color: '#FFD60A',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  guideText: {
    color: '#AEAEB2',
    fontSize: 13,
    lineHeight: 18,
  },
  divider: {
    height: 8,
    backgroundColor: '#111',
  },
  captureSection: {
    padding: 16,
  },
  captureButtons: {
    gap: 10,
  },
  captureButton: {
    backgroundColor: '#FFD60A',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  captureButtonSecondary: {
    backgroundColor: '#2C2C2E',
  },
  captureButtonIcon: {
    fontSize: 20,
  },
  captureButtonLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  pendingSection: {
    marginTop: 20,
  },
  pendingHeader: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  pendingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pendingCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 10,
    overflow: 'visible',
  },
  pendingThumb: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 10,
  },
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  removeBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  confirmBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2C2C2E',
  },
  confirmButton: {
    backgroundColor: '#FFD60A',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    color: '#1C1C1E',
    fontSize: 16,
    fontWeight: '700',
  },
});
