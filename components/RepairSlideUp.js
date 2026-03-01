import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Linking,
  Image,
} from 'react-native';
import { useInspection } from '../context/InspectionContext';
import { buildRepairList, calculateTotalPrice } from '../lib/partsApi';
import { findPointById } from '../data/inspectionData';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const PANEL_MODES = {
  HIDDEN: 'hidden',
  HALF: 'half',
  FULL: 'full',
};

// Panel heights (from bottom of screen)
const HANDLE_HEIGHT = 52;
const HALF_HEIGHT = SCREEN_HEIGHT * 0.5;
const FULL_HEIGHT = SCREEN_HEIGHT * 0.92;

function modeToHeight(mode) {
  switch (mode) {
    case PANEL_MODES.FULL: return FULL_HEIGHT;
    case PANEL_MODES.HALF: return HALF_HEIGHT;
    default: return HANDLE_HEIGHT;
  }
}

const STATUS_CONFIG = {
  action: { color: '#FF3B30', label: 'Needs Action', short: '!' },
  monitor: { color: '#FF9500', label: 'Monitor', short: '~' },
};

export default function RepairSlideUp({ onOpenInspection }) {
  const { getActionItems } = useInspection();
  const [mode, setMode] = useState(PANEL_MODES.HIDDEN);
  const animatedHeight = useRef(new Animated.Value(HANDLE_HEIGHT)).current;
  const lastHeightRef = useRef(HANDLE_HEIGHT);

  const actionItems = getActionItems();
  const repairList = buildRepairList(actionItems, findPointById);
  const totalPrice = calculateTotalPrice(repairList);

  const animateTo = useCallback((targetHeight) => {
    lastHeightRef.current = targetHeight;
    Animated.spring(animatedHeight, {
      toValue: targetHeight,
      useNativeDriver: false,
      damping: 20,
      stiffness: 180,
    }).start();
  }, [animatedHeight]);

  const setModeAndAnimate = useCallback((newMode) => {
    setMode(newMode);
    animateTo(modeToHeight(newMode));
  }, [animateTo]);

  // Swipe gesture handling
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        animatedHeight.stopAnimation();
      },
      onPanResponderMove: (_, gesture) => {
        const newHeight = Math.max(
          HANDLE_HEIGHT,
          Math.min(FULL_HEIGHT, lastHeightRef.current - gesture.dy)
        );
        animatedHeight.setValue(newHeight);
      },
      onPanResponderRelease: (_, gesture) => {
        const velocity = gesture.vy;
        const currentH = lastHeightRef.current - gesture.dy;

        let newMode;
        if (velocity < -0.5) {
          // Flick up
          if (currentH < HALF_HEIGHT) newMode = PANEL_MODES.HALF;
          else newMode = PANEL_MODES.FULL;
        } else if (velocity > 0.5) {
          // Flick down
          if (currentH > HALF_HEIGHT) newMode = PANEL_MODES.HALF;
          else newMode = PANEL_MODES.HIDDEN;
        } else {
          // Snap to nearest
          const distHidden = Math.abs(currentH - HANDLE_HEIGHT);
          const distHalf = Math.abs(currentH - HALF_HEIGHT);
          const distFull = Math.abs(currentH - FULL_HEIGHT);
          if (distHidden < distHalf && distHidden < distFull) newMode = PANEL_MODES.HIDDEN;
          else if (distHalf < distFull) newMode = PANEL_MODES.HALF;
          else newMode = PANEL_MODES.FULL;
        }

        setMode(newMode);
        const targetH = modeToHeight(newMode);
        lastHeightRef.current = targetH;
        Animated.spring(animatedHeight, {
          toValue: targetH,
          useNativeDriver: false,
          damping: 20,
          stiffness: 180,
        }).start();
      },
    })
  ).current;

  // Keep ref in sync for pan calculations
  useEffect(() => {
    const id = animatedHeight.addListener(({ value }) => {
      lastHeightRef.current = value;
    });
    return () => animatedHeight.removeListener(id);
  }, [animatedHeight]);

  const handleHalfToggle = () => {
    if (mode === PANEL_MODES.HIDDEN) setModeAndAnimate(PANEL_MODES.HALF);
    else if (mode === PANEL_MODES.HALF) setModeAndAnimate(PANEL_MODES.HIDDEN);
    else setModeAndAnimate(PANEL_MODES.HALF);
  };

  const actionCount = repairList.filter((r) => r.status === 'action').length;
  const monitorCount = repairList.filter((r) => r.status === 'monitor').length;

  return (
    <Animated.View style={[styles.panel, { height: animatedHeight }]}>
      {/* Drag handle */}
      <View style={styles.handleArea} {...panResponder.panHandlers}>
        <View style={styles.handle} />
        <TouchableOpacity onPress={handleHalfToggle} style={styles.summaryRow}>
          <View style={styles.summaryBadges}>
            {actionCount > 0 && (
              <View style={[styles.badge, { backgroundColor: '#FF3B30' }]}>
                <Text style={styles.badgeText}>{actionCount} Action</Text>
              </View>
            )}
            {monitorCount > 0 && (
              <View style={[styles.badge, { backgroundColor: '#FF9500' }]}>
                <Text style={styles.badgeText}>{monitorCount} Monitor</Text>
              </View>
            )}
            {repairList.length === 0 && (
              <Text style={styles.allClearText}>All Clear — No Issues Found</Text>
            )}
          </View>
          <View style={styles.chevronContainer}>
            <Text style={[styles.chevron, mode !== PANEL_MODES.HIDDEN && styles.chevronDown]}>
              ›
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* List content */}
      {repairList.length > 0 ? (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={mode !== PANEL_MODES.HIDDEN}
        >
          <Text style={styles.listHeader}>Recommended Repairs</Text>

          {repairList.map((item) => {
            const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.monitor;
            return (
              <TouchableOpacity
                key={item.pointId}
                style={styles.repairItem}
                onPress={() => onOpenInspection && onOpenInspection(item.pointId)}
                activeOpacity={0.75}
              >
                {/* Left: status color bar + icon */}
                <View style={[styles.statusBar, { backgroundColor: cfg.color }]} />

                {/* Part image placeholder */}
                <View style={styles.partImageContainer}>
                  {item.imageUri ? (
                    <Image source={{ uri: item.imageUri }} style={styles.partImage} />
                  ) : (
                    <View style={[styles.partImagePlaceholder, { borderColor: cfg.color }]}>
                      <Text style={[styles.partIconText, { color: cfg.color }]}>
                        {cfg.short}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Text info */}
                <View style={styles.partInfo}>
                  <View style={styles.partTitleRow}>
                    <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
                    <Text style={styles.partName} numberOfLines={2}>
                      {item.name}
                    </Text>
                  </View>
                  <Text style={styles.partNumber}>P/N: {item.partNumber}</Text>
                  <Text style={styles.perspectiveLabel} numberOfLines={1}>
                    {item.perspectiveLabel} › {item.pointLabel}
                  </Text>
                  <Text style={styles.repairNote} numberOfLines={2}>
                    {item.repairNote}
                  </Text>
                </View>

                {/* Right: price + link */}
                <View style={styles.priceColumn}>
                  <Text style={styles.price}>
                    {item.price > 0 ? `$${item.price.toLocaleString('en-US', { minimumFractionDigits: 0 })}` : 'TBD'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => item.purchaseUrl && Linking.openURL(item.purchaseUrl)}
                    style={styles.buyButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.buyButtonText}>Buy</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Total price */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Estimated Total</Text>
            <Text style={styles.totalPrice}>
              ${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 0 })}
            </Text>
          </View>
          <Text style={styles.disclaimer}>
            * Prices are estimates. Contact your CAT dealer for accurate quotes.
          </Text>
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>✓</Text>
          <Text style={styles.emptyTitle}>No Issues Detected</Text>
          <Text style={styles.emptySubtitle}>Complete the inspection to see results here.</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 20,
    overflow: 'hidden',
  },
  handleArea: {
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#48484A',
    alignSelf: 'center',
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
  },
  summaryBadges: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    flex: 1,
  },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  allClearText: {
    color: '#30D158',
    fontSize: 13,
    fontWeight: '600',
  },
  chevronContainer: {
    width: 24,
    alignItems: 'center',
  },
  chevron: {
    color: '#636366',
    fontSize: 22,
    transform: [{ rotate: '-90deg' }],
  },
  chevronDown: {
    transform: [{ rotate: '90deg' }],
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  listHeader: {
    color: '#EBEBF5',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 4,
    letterSpacing: 0.2,
  },
  repairItem: {
    flexDirection: 'row',
    backgroundColor: '#2C2C2E',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    alignItems: 'stretch',
  },
  statusBar: {
    width: 4,
  },
  partImageContainer: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  partImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  partImagePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3A3A3C',
  },
  partIconText: {
    fontSize: 20,
    fontWeight: '800',
  },
  partInfo: {
    flex: 1,
    paddingVertical: 10,
    paddingRight: 4,
    gap: 2,
  },
  partTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    flexShrink: 0,
  },
  partName: {
    color: '#EBEBF5',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  partNumber: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '400',
    marginLeft: 13,
  },
  perspectiveLabel: {
    color: '#636366',
    fontSize: 11,
    marginLeft: 13,
    marginTop: 1,
  },
  repairNote: {
    color: '#AEAEB2',
    fontSize: 11,
    marginLeft: 13,
    marginTop: 3,
    lineHeight: 15,
  },
  priceColumn: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 12,
    paddingVertical: 10,
    gap: 6,
    minWidth: 70,
  },
  price: {
    color: '#EBEBF5',
    fontSize: 15,
    fontWeight: '700',
  },
  buyButton: {
    backgroundColor: '#FFD60A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  buyButtonText: {
    color: '#1C1C1E',
    fontSize: 12,
    fontWeight: '700',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#3A3A3C',
    marginTop: 8,
    paddingTop: 14,
    paddingHorizontal: 4,
  },
  totalLabel: {
    color: '#EBEBF5',
    fontSize: 16,
    fontWeight: '700',
  },
  totalPrice: {
    color: '#FFD60A',
    fontSize: 20,
    fontWeight: '800',
  },
  disclaimer: {
    color: '#636366',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 44,
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#EBEBF5',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#636366',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
