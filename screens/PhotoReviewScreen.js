import React, { useState, useCallback } from 'react';
import {
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { useInspection } from '../context/InspectionContext';
import { findPointById } from '../data/inspectionData';

const { width: SW, height: SH } = Dimensions.get('window');

const SEVERITY_CONFIG = {
  Critical: { stroke: '#FF3B30', fill: 'rgba(255,59,48,0.15)', labelBg: '#FF3B30' },
  Major: { stroke: '#FF9500', fill: 'rgba(255,149,0,0.15)', labelBg: '#FF9500' },
  Minor: { stroke: '#FFCC00', fill: 'rgba(255,204,0,0.15)', labelBg: '#FFCC00' },
};

const DEFAULT_SEVERITY_CFG = SEVERITY_CONFIG.Major;

/**
 * PhotoReviewScreen
 *
 * Props:
 *   pointId   — inspection point id
 *   photoId   — photo id to display
 *   onBack    — navigate back to inspection modal
 */
export default function PhotoReviewScreen({ pointId, photoId, onBack }) {
  const { state } = useInspection();
  const point = findPointById(pointId);
  const pointState = state[pointId] || { photos: [] };
  const photo = pointState.photos.find((p) => p.id === photoId);

  const [imageLayout, setImageLayout] = useState({ width: SW, height: SW * 0.75 });
  const [showIssueList, setShowIssueList] = useState(false);

  const handleImageLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    setImageLayout({ width, height });
  }, []);

  if (!photo) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity onPress={onBack} style={styles.topBarSimple}>
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Photo not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isProcessing = photo.processing;
  const evaluation = photo.evaluation;
  const issues = evaluation?.issues || [];
  const verdict = evaluation?.verdict;

  const verdictColor = verdict === 'pass' ? '#30D158' : '#FF3B30';
  const verdictLabel = verdict === 'pass' ? 'PASS' : 'FAIL';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

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
          {point?.label || 'Photo Review'}
        </Text>
        {/* Verdict badge */}
        {!isProcessing && verdict && (
          <View style={[styles.verdictBadge, { backgroundColor: verdictColor }]}>
            <Text style={styles.verdictText}>{verdictLabel}</Text>
          </View>
        )}
        {isProcessing && <View style={styles.topRight} />}
      </View>

      {/* Image + bounding box overlay */}
      <View style={styles.imageArea} onLayout={handleImageLayout}>
        <Image
          source={{ uri: photo.uri }}
          style={styles.fullImage}
          resizeMode="contain"
          onLayout={handleImageLayout}
        />

        {/* Processing state */}
        {isProcessing && (
          <View style={styles.processingOverlay}>
            <View style={styles.processingCard}>
              <Text style={styles.processingIcon}>⏳</Text>
              <Text style={styles.processingTitle}>Evaluation Processing</Text>
              <Text style={styles.processingSubtitle}>
                AI is analyzing your photo.{'\n'}This usually takes 10–30 seconds.
              </Text>
            </View>
          </View>
        )}

        {/* SVG Bounding boxes */}
        {!isProcessing && issues.length > 0 && (
          <View
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            <Svg
              width={imageLayout.width}
              height={imageLayout.height}
              style={StyleSheet.absoluteFill}
            >
              {issues.map((issue, idx) => {
                const bbox = issue.bbox;
                if (!bbox) return null;
                const cfg = SEVERITY_CONFIG[issue.severity] || DEFAULT_SEVERITY_CFG;
                const x = bbox.x * imageLayout.width;
                const y = bbox.y * imageLayout.height;
                const w = bbox.width * imageLayout.width;
                const h = bbox.height * imageLayout.height;

                return (
                  <React.Fragment key={idx}>
                    <Rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      rx={6}
                      ry={6}
                      fill={cfg.fill}
                      stroke={cfg.stroke}
                      strokeWidth={2}
                    />
                    {/* Severity label chip */}
                    <Rect
                      x={x}
                      y={Math.max(0, y - 20)}
                      width={Math.max(w, issue.severity.length * 7 + 10)}
                      height={18}
                      rx={4}
                      ry={4}
                      fill={cfg.labelBg}
                    />
                    <SvgText
                      x={x + 5}
                      y={Math.max(12, y - 6)}
                      fill="#fff"
                      fontSize="10"
                      fontWeight="bold"
                    >
                      {issue.severity}
                    </SvgText>
                  </React.Fragment>
                );
              })}
            </Svg>
          </View>
        )}
      </View>

      {/* Description & issues list */}
      {!isProcessing && evaluation && (
        <ScrollView
          style={styles.detailsPanel}
          showsVerticalScrollIndicator={false}
        >
          {/* AI description */}
          <View style={styles.descriptionRow}>
            <Text style={styles.descriptionLabel}>AI Assessment</Text>
            <Text style={styles.descriptionText}>
              {evaluation.description || (verdict === 'pass' ? 'Good — no issues found.' : 'Issues detected.')}
            </Text>
          </View>

          {/* Issues list */}
          {issues.length > 0 && (
            <>
              <TouchableOpacity
                style={styles.issuesToggle}
                onPress={() => setShowIssueList((v) => !v)}
              >
                <Text style={styles.issuesToggleText}>
                  {showIssueList ? '▼' : '▶'}  {issues.length} issue{issues.length > 1 ? 's' : ''} detected
                </Text>
              </TouchableOpacity>

              {showIssueList && (
                <View style={styles.issuesList}>
                  {issues.map((issue, idx) => {
                    const cfg = SEVERITY_CONFIG[issue.severity] || DEFAULT_SEVERITY_CFG;
                    return (
                      <View
                        key={idx}
                        style={[styles.issueItem, { borderLeftColor: cfg.stroke }]}
                      >
                        <View style={styles.issueHeader}>
                          <View style={[styles.severityTag, { backgroundColor: cfg.labelBg }]}>
                            <Text style={styles.severityTagText}>{issue.severity}</Text>
                          </View>
                        </View>
                        <Text style={styles.issueDesc}>{issue.description}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {issues.length === 0 && verdict === 'pass' && (
            <View style={styles.passCard}>
              <Text style={styles.passIcon}>✓</Text>
              <Text style={styles.passText}>No issues found</Text>
            </View>
          )}

          <View style={styles.bottomPad} />
        </ScrollView>
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
  topBarSimple: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
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
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  topRight: {
    minWidth: 64,
  },
  verdictBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 64,
    alignItems: 'center',
  },
  verdictText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  imageArea: {
    width: SW,
    aspectRatio: 4 / 3,
    backgroundColor: '#111',
    position: 'relative',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  processingCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    maxWidth: 280,
  },
  processingIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  processingTitle: {
    color: '#EBEBF5',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  processingSubtitle: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  detailsPanel: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 16,
  },
  descriptionRow: {
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3A3A3C',
  },
  descriptionLabel: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  descriptionText: {
    color: '#EBEBF5',
    fontSize: 14,
    lineHeight: 20,
  },
  issuesToggle: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3A3A3C',
  },
  issuesToggleText: {
    color: '#FFD60A',
    fontSize: 14,
    fontWeight: '600',
  },
  issuesList: {
    paddingTop: 8,
    gap: 8,
  },
  issueItem: {
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
  },
  issueHeader: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  severityTag: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  severityTagText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  issueDesc: {
    color: '#EBEBF5',
    fontSize: 13,
    lineHeight: 18,
  },
  passCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  passIcon: {
    color: '#30D158',
    fontSize: 22,
  },
  passText: {
    color: '#30D158',
    fontSize: 15,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#8E8E93',
    fontSize: 16,
  },
  bottomPad: {
    height: 40,
  },
});
