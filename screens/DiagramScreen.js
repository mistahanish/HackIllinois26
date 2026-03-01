import React, { useState, useCallback, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  Platform,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useInspection } from '../context/InspectionContext';
import { PERSPECTIVES, findPointById } from '../data/inspectionData';
import { buildRepairList, calculateTotalPrice } from '../lib/partsApi';
import InspectionModal from './InspectionModal';
import PhotoCaptureScreen from './PhotoCaptureScreen';
import PhotoReviewScreen from './PhotoReviewScreen';
import RepairSlideUp from '../components/RepairSlideUp';

const { width: SW, height: SH } = Dimensions.get('window');

const DOT_SIZE = 28;
const DOT_HIT_SLOP = 10;

const STATUS_DOT_CONFIG = {
  pending: { bg: '#636366', border: '#8E8E93', icon: null },
  good: { bg: '#30D158', border: '#34C759', icon: '✓' },
  monitor: { bg: '#FF9500', border: '#FF9F0A', icon: '✗' },
  action: { bg: '#FF3B30', border: '#FF453A', icon: '!' },
};

const NAV_ARROWS = [
  { dir: 'up', label: '↑', style: 'arrowUp' },
  { dir: 'down', label: '↓', style: 'arrowDown' },
  { dir: 'left', label: '←', style: 'arrowLeft' },
  { dir: 'right', label: '→', style: 'arrowRight' },
];

// Sub-screens rendered on top of DiagramScreen
const SUB_SCREEN = {
  NONE: 'none',
  CAPTURE: 'capture',
  REVIEW: 'review',
};

export default function DiagramScreen({ inspection, onBack }) {
  const { state, getActionItems } = useInspection();
  const [perspectiveId, setPerspectiveId] = useState('front');
  const [imageLayout, setImageLayout] = useState({ width: SW, height: SW * 0.6 });

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPointId, setSelectedPointId] = useState(null);

  // Sub-screen navigation
  const [subScreen, setSubScreen] = useState(SUB_SCREEN.NONE);
  const [capturePointId, setCapturePointId] = useState(null);
  const [reviewPointId, setReviewPointId] = useState(null);
  const [reviewPhotoId, setReviewPhotoId] = useState(null);

  // Nav arrow fade animation
  const navFade = useRef(new Animated.Value(1)).current;

  const perspective = PERSPECTIVES[perspectiveId] || PERSPECTIVES.front;

  const handleNavigate = useCallback(
    (dir) => {
      const nextId = perspective.nav[dir];
      if (!nextId) return;

      // Quick fade transition
      Animated.sequence([
        Animated.timing(navFade, { toValue: 0.3, duration: 80, useNativeDriver: true }),
        Animated.timing(navFade, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start();

      setPerspectiveId(nextId);
    },
    [perspective, navFade]
  );

  const handleDotPress = useCallback((pointId) => {
    setSelectedPointId(pointId);
    setModalVisible(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
    setSelectedPointId(null);
  }, []);

  const handleOpenCapture = useCallback((pointId) => {
    setModalVisible(false);
    setCapturePointId(pointId);
    setSubScreen(SUB_SCREEN.CAPTURE);
  }, []);

  const handleCaptureBack = useCallback(() => {
    setSubScreen(SUB_SCREEN.NONE);
    setCapturePointId(null);
    // Re-open the modal for the same point
    if (selectedPointId) setModalVisible(true);
  }, [selectedPointId]);

  const handleOpenReview = useCallback((pointId, photoId) => {
    setModalVisible(false);
    setReviewPointId(pointId);
    setReviewPhotoId(photoId);
    setSubScreen(SUB_SCREEN.REVIEW);
  }, []);

  const handleReviewBack = useCallback(() => {
    setSubScreen(SUB_SCREEN.NONE);
    setReviewPointId(null);
    setReviewPhotoId(null);
    if (selectedPointId) setModalVisible(true);
  }, [selectedPointId]);

  const handleOpenInspectionFromList = useCallback((pointId) => {
    // Find which perspective has this point and navigate there
    for (const [pid, persp] of Object.entries(PERSPECTIVES)) {
      if (persp.points.some((p) => p.id === pointId)) {
        setPerspectiveId(pid);
        break;
      }
    }
    setSelectedPointId(pointId);
    setModalVisible(true);
  }, []);

  const handleImageLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    setImageLayout({ width, height });
  }, []);

  // ── CSV Export ─────────────────────────────────────────────────────────────
  const buildCsvContent = useCallback(() => {
    const actionItems = getActionItems();
    const repairList = buildRepairList(actionItems, findPointById);
    const total = calculateTotalPrice(repairList);

    const header = 'Status,Inspection Point,Perspective,Part Name,Part Number,Price,Purchase URL,Notes\n';
    const rows = repairList.map((item) => {
      const notes = state[item.pointId]?.notes || '';
      return [
        item.status,
        `"${item.pointLabel}"`,
        `"${item.perspectiveLabel}"`,
        `"${item.name}"`,
        item.partNumber,
        item.price,
        item.purchaseUrl,
        `"${notes.replace(/"/g, '""')}"`,
      ].join(',');
    });

    return (
      header +
      rows.join('\n') +
      `\n\nEstimated Total,$${total.toFixed(2)}`
    );
  }, [getActionItems, state]);

  const handleDownload = useCallback(async () => {
    try {
      const csv = buildCsvContent();
      const filename = `CATrack_Inspection_${Date.now()}.csv`;
      const fileUri = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Download Inspection Report',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Saved', `Report saved to: ${fileUri}`);
      }
    } catch (e) {
      Alert.alert('Error', `Could not generate report: ${e.message}`);
    }
  }, [buildCsvContent]);

  const handleShare = useCallback(async () => {
    try {
      const csv = buildCsvContent();
      const filename = `CATrack_Inspection_${Date.now()}.csv`;
      const fileUri = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Share Inspection Report',
        });
      } else {
        await Share.share({
          title: 'CATrack Inspection Report',
          message: csv,
        });
      }
    } catch (e) {
      Alert.alert('Error', `Could not share: ${e.message}`);
    }
  }, [buildCsvContent]);

  // ── Sub-screen rendering ───────────────────────────────────────────────────
  if (subScreen === SUB_SCREEN.CAPTURE) {
    return (
      <PhotoCaptureScreen
        pointId={capturePointId}
        onBack={handleCaptureBack}
      />
    );
  }

  if (subScreen === SUB_SCREEN.REVIEW) {
    return (
      <PhotoReviewScreen
        pointId={reviewPointId}
        photoId={reviewPhotoId}
        onBack={handleReviewBack}
      />
    );
  }

  // ── Compute counts for header badges ──────────────────────────────────────
  const actionCount = Object.values(state).filter((s) => s.status === 'action').length;
  const monitorCount = Object.values(state).filter((s) => s.status === 'monitor').length;
  const totalPoints = Object.keys(state).length;
  const inspectedCount = Object.values(state).filter((s) => s.status !== 'pending').length;

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
        </TouchableOpacity>

        <View style={styles.topCenter}>
          <Text style={styles.topTitle}>CAT 982M</Text>
          <Text style={styles.topSubtitle}>
            {inspectedCount}/{totalPoints} inspected
          </Text>
        </View>

        {/* Download button */}
        <TouchableOpacity
          onPress={handleDownload}
          style={styles.downloadButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.downloadIcon}>⬇</Text>
        </TouchableOpacity>
      </View>

      {/* Status summary strip */}
      <View style={styles.statusStrip}>
        <View style={styles.statusStripItem}>
          <View style={[styles.stripDot, { backgroundColor: '#636366' }]} />
          <Text style={styles.stripText}>
            {totalPoints - inspectedCount} Pending
          </Text>
        </View>
        {inspectedCount - actionCount - monitorCount > 0 && (
          <View style={styles.statusStripItem}>
            <View style={[styles.stripDot, { backgroundColor: '#30D158' }]} />
            <Text style={styles.stripText}>
              {inspectedCount - actionCount - monitorCount} Good
            </Text>
          </View>
        )}
        {monitorCount > 0 && (
          <View style={styles.statusStripItem}>
            <View style={[styles.stripDot, { backgroundColor: '#FF9500' }]} />
            <Text style={styles.stripText}>{monitorCount} Monitor</Text>
          </View>
        )}
        {actionCount > 0 && (
          <View style={styles.statusStripItem}>
            <View style={[styles.stripDot, { backgroundColor: '#FF3B30' }]} />
            <Text style={styles.stripText}>{actionCount} Action</Text>
          </View>
        )}
      </View>

      {/* Diagram area */}
      <View style={styles.diagramArea}>
        {/* Perspective label */}
        <View style={styles.perspectiveLabel}>
          <Text style={styles.perspectiveLabelText}>{perspective.label}</Text>
        </View>

        {/* Machine image with dot overlay */}
        <Animated.View
          style={[styles.imageWrapper, { opacity: navFade }]}
          onLayout={handleImageLayout}
        >
          <Image
            source={perspective.image}
            style={styles.machineImage}
            resizeMode="contain"
          />

          {/* Inspection dots */}
          {perspective.points.map((pt) => {
            const ptState = state[pt.id] || {};
            const cfg = STATUS_DOT_CONFIG[ptState.status || 'pending'];
            const x = pt.position.x * imageLayout.width - DOT_SIZE / 2;
            const y = pt.position.y * imageLayout.height - DOT_SIZE / 2;

            return (
              <TouchableOpacity
                key={pt.id}
                style={[
                  styles.dot,
                  {
                    left: x,
                    top: y,
                    backgroundColor: cfg.bg,
                    borderColor: cfg.border,
                  },
                ]}
                onPress={() => handleDotPress(pt.id)}
                hitSlop={{
                  top: DOT_HIT_SLOP,
                  bottom: DOT_HIT_SLOP,
                  left: DOT_HIT_SLOP,
                  right: DOT_HIT_SLOP,
                }}
                activeOpacity={0.75}
              >
                {cfg.icon ? (
                  <Text style={styles.dotIcon}>{cfg.icon}</Text>
                ) : (
                  <View style={styles.dotPulse} />
                )}
              </TouchableOpacity>
            );
          })}
        </Animated.View>

        {/* Navigation arrows */}
        <View style={styles.navContainer} pointerEvents="box-none">
          {NAV_ARROWS.map(({ dir, label, style: arrowStyle }) => {
            const enabled = !!perspective.nav[dir];
            return (
              <TouchableOpacity
                key={dir}
                style={[styles.navArrow, styles[arrowStyle], !enabled && styles.navArrowDisabled]}
                onPress={() => handleNavigate(dir)}
                disabled={!enabled}
                activeOpacity={0.75}
              >
                <Text style={[styles.navArrowText, !enabled && styles.navArrowTextDisabled]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Share button bottom-right of diagram area */}
        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShare}
          activeOpacity={0.8}
        >
          <Text style={styles.shareIcon}>↗</Text>
        </TouchableOpacity>
      </View>

      {/* Slide-up repair panel */}
      <RepairSlideUp onOpenInspection={handleOpenInspectionFromList} />

      {/* Inspection modal */}
      {selectedPointId && (
        <InspectionModal
          visible={modalVisible}
          pointId={selectedPointId}
          pointLabel={findPointById(selectedPointId)?.label || selectedPointId}
          onClose={handleModalClose}
          onOpenPhotoCapture={handleOpenCapture}
          onOpenPhotoReview={handleOpenReview}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  // ── Top bar ──────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2C2E',
  },
  backButton: {
    width: 36,
  },
  backArrow: {
    color: '#FFD60A',
    fontSize: 32,
    lineHeight: 34,
    marginTop: -2,
  },
  topCenter: {
    flex: 1,
    alignItems: 'center',
  },
  topTitle: {
    color: '#EBEBF5',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  topSubtitle: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 1,
  },
  downloadButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadIcon: {
    color: '#FFD60A',
    fontSize: 16,
  },

  // ── Status strip ─────────────────────────────────────────────────────────
  statusStrip: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 12,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1C1C1E',
  },
  statusStripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stripDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  stripText: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '500',
  },

  // ── Diagram area ─────────────────────────────────────────────────────────
  diagramArea: {
    flex: 1,
    backgroundColor: '#111',
    position: 'relative',
  },
  perspectiveLabel: {
    position: 'absolute',
    top: 8,
    left: 12,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  perspectiveLabelText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  imageWrapper: {
    flex: 1,
    position: 'relative',
  },
  machineImage: {
    width: '100%',
    height: '100%',
  },

  // ── Inspection dots ───────────────────────────────────────────────────────
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 20,
  },
  dotIcon: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  dotPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },

  // ── Navigation arrows ─────────────────────────────────────────────────────
  navContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
  },
  navArrow: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(28,28,30,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowUp: {
    top: 12,
    left: '50%',
    marginLeft: -20,
  },
  arrowDown: {
    bottom: 16,
    left: '50%',
    marginLeft: -20,
  },
  arrowLeft: {
    left: 12,
    top: '50%',
    marginTop: -20,
  },
  arrowRight: {
    right: 12,
    top: '50%',
    marginTop: -20,
  },
  navArrowDisabled: {
    opacity: 0.2,
  },
  navArrowText: {
    color: '#EBEBF5',
    fontSize: 18,
    fontWeight: '300',
  },
  navArrowTextDisabled: {
    color: '#636366',
  },

  // ── Share button ──────────────────────────────────────────────────────────
  shareButton: {
    position: 'absolute',
    bottom: 16,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(28,28,30,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  shareIcon: {
    color: '#EBEBF5',
    fontSize: 17,
    fontWeight: '600',
  },
});
