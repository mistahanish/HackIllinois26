import React, { useState, useCallback } from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useInspection } from '../context/InspectionContext';
import { getRepairSuggestion } from '../lib/partsApi';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PHOTO_CELL_SIZE = (SCREEN_WIDTH - 32 - 8 * 3) / 4;

const STATUS_OPTIONS = [
  { key: 'good', label: 'Good', color: '#30D158', icon: '✓' },
  { key: 'monitor', label: 'Monitor', color: '#FF9500', icon: '✗' },
  { key: 'action', label: 'Needs Action', color: '#FF3B30', icon: '!' },
];

function StatusIcon({ status, size = 16 }) {
  const cfg = STATUS_OPTIONS.find((s) => s.key === status);
  if (!status || status === 'pending') return null;
  return (
    <View
      style={[
        styles.statusIconBadge,
        { backgroundColor: cfg?.color || '#8E8E93', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 },
      ]}
    >
      <Text style={[styles.statusIconText, { fontSize: size - 3 }]}>{cfg?.icon}</Text>
    </View>
  );
}

export default function InspectionModal({
  visible,
  pointId,
  pointLabel,
  onClose,
  onOpenPhotoCapture,
  onOpenPhotoReview,
}) {
  const { state, setStatus, setNotes } = useInspection();
  const pointState = state[pointId] || { status: 'pending', notes: '', photos: [] };
  const [showFixes, setShowFixes] = useState(false);

  const repairSuggestion = getRepairSuggestion(pointId);

  const handleStatusChange = useCallback(
    (newStatus) => {
      setStatus(pointId, newStatus);
    },
    [pointId, setStatus]
  );

  const handleNotesChange = useCallback(
    (text) => {
      setNotes(pointId, text);
    },
    [pointId, setNotes]
  );

  const currentStatusCfg = STATUS_OPTIONS.find((s) => s.key === pointState.status);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <View style={styles.sheet}>
            {/* Drag handle */}
            <View style={styles.dragHandle} />

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                {pointState.status !== 'pending' && (
                  <StatusIcon status={pointState.status} size={18} />
                )}
                <Text style={styles.headerTitle} numberOfLines={2}>
                  {pointLabel || 'Inspection Point'}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scrollBody}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Status selector */}
              <Text style={styles.sectionLabel}>Status</Text>
              <View style={styles.statusRow}>
                {STATUS_OPTIONS.map((opt) => {
                  const selected = pointState.status === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.statusPill,
                        { borderColor: opt.color },
                        selected && { backgroundColor: opt.color },
                      ]}
                      onPress={() => handleStatusChange(opt.key)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          { color: selected ? '#FFF' : opt.color },
                        ]}
                      >
                        {opt.icon}  {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Notes */}
              <Text style={styles.sectionLabel}>Notes</Text>
              <TextInput
                style={styles.notesInput}
                value={pointState.notes}
                onChangeText={handleNotesChange}
                placeholder="Add inspection notes..."
                placeholderTextColor="#636366"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {/* Photos */}
              <Text style={styles.sectionLabel}>Photos</Text>
              <View style={styles.photoGrid}>
                {/* Add Photo button — always first */}
                <TouchableOpacity
                  style={styles.addPhotoCell}
                  onPress={() => onOpenPhotoCapture && onOpenPhotoCapture(pointId)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.addPhotoIcon}>+</Text>
                  <Text style={styles.addPhotoText}>Add Photo</Text>
                </TouchableOpacity>

                {/* Existing photos */}
                {pointState.photos.map((photo) => (
                  <TouchableOpacity
                    key={photo.id}
                    style={styles.photoCell}
                    onPress={() =>
                      onOpenPhotoReview && onOpenPhotoReview(pointId, photo.id)
                    }
                    activeOpacity={0.8}
                  >
                    <Image source={{ uri: photo.uri }} style={styles.photoThumbnail} />
                    {/* Processing overlay */}
                    {photo.processing && (
                      <View style={styles.processingOverlay}>
                        <Text style={styles.processingDot}>●</Text>
                      </View>
                    )}
                    {/* Verdict badge */}
                    {!photo.processing && photo.evaluation && (
                      <View
                        style={[
                          styles.verdictBadge,
                          {
                            backgroundColor:
                              photo.evaluation.verdict === 'pass' ? '#30D158' : '#FF3B30',
                          },
                        ]}
                      >
                        <Text style={styles.verdictBadgeText}>
                          {photo.evaluation.verdict === 'pass' ? '✓' : '!'}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Suggested Fixes */}
              <TouchableOpacity
                style={styles.suggestedFixesButton}
                onPress={() => setShowFixes(!showFixes)}
                activeOpacity={0.75}
              >
                <Text style={styles.suggestedFixesText}>
                  {showFixes ? '▼  Hide Suggested Fix' : '▶  Suggested Fix'}
                </Text>
              </TouchableOpacity>

              {showFixes && (
                <View style={styles.fixCard}>
                  <View style={styles.fixCardHeader}>
                    <Text style={styles.fixPartNumber}>P/N: {repairSuggestion.partNumber}</Text>
                    {repairSuggestion.price > 0 && (
                      <Text style={styles.fixPrice}>
                        ~${repairSuggestion.price.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.fixPartName}>{repairSuggestion.name}</Text>
                  <Text style={styles.fixNote}>{repairSuggestion.repairNote}</Text>
                  <Text style={styles.fixDisclaimer}>
                    * Estimated price. Contact your CAT dealer for quote.
                  </Text>
                </View>
              )}

              <View style={styles.bottomPad} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  keyboardAvoid: {
    width: '100%',
  },
  sheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: 0,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#48484A',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3A3A3C',
  },
  headerTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  headerTitle: {
    color: '#EBEBF5',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    lineHeight: 24,
  },
  closeButton: {
    marginLeft: 12,
    padding: 2,
  },
  closeX: {
    color: '#636366',
    fontSize: 18,
  },
  scrollBody: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  statusPill: {
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  notesInput: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    padding: 14,
    color: '#EBEBF5',
    fontSize: 14,
    lineHeight: 20,
    minHeight: 88,
    marginBottom: 20,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  addPhotoCell: {
    width: PHOTO_CELL_SIZE,
    height: PHOTO_CELL_SIZE,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FFD60A',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,214,10,0.06)',
  },
  addPhotoIcon: {
    color: '#FFD60A',
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 26,
  },
  addPhotoText: {
    color: '#FFD60A',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  photoCell: {
    width: PHOTO_CELL_SIZE,
    height: PHOTO_CELL_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#2C2C2E',
  },
  photoThumbnail: {
    width: '100%',
    height: '100%',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingDot: {
    color: '#FFD60A',
    fontSize: 16,
  },
  verdictBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verdictBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  suggestedFixesButton: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  suggestedFixesText: {
    color: '#FFD60A',
    fontSize: 14,
    fontWeight: '600',
  },
  fixCard: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9500',
  },
  fixCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  fixPartNumber: {
    color: '#8E8E93',
    fontSize: 12,
  },
  fixPrice: {
    color: '#FFD60A',
    fontSize: 15,
    fontWeight: '700',
  },
  fixPartName: {
    color: '#EBEBF5',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  fixNote: {
    color: '#AEAEB2',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  fixDisclaimer: {
    color: '#636366',
    fontSize: 11,
  },
  statusIconBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconText: {
    color: '#FFF',
    fontWeight: '800',
  },
  bottomPad: {
    height: 32,
  },
});
