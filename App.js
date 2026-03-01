import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './lib/supabase';
import { InspectionProvider } from './context/InspectionContext';
import DiagramScreen from './screens/DiagramScreen';

const TABS = {
  FLEET: 'Fleet',
  INSPECTIONS: 'Inspections',
  REPORTS: 'Reports',
  FAVORITES: 'Favorites',
};

const INSPECTION_SCREENS = {
  LIST: 'List',
  CREATE: 'Create',
  DETAIL: 'Detail',
  DIAGRAM: 'Diagram',
  WALK_AROUND: 'WalkAround',
  GENERAL_INFO: 'GeneralInfo',
};

const WALK_AROUND_ITEMS = [
  'Check fluid levels, including engine oil, transmission fluid, coolant system, and any other compartments on the asset.',
  'Look for signs of leaks around engine, hydraulic components, and coolant system.',
  'Confirm head lights, backup lights, turn signals and other visual and audible alarms are working properly.',
  'Look for cracked or broken glass, missing or broken mirrors, flat or damaged tires, damaged steps, hand grips and safety rails (where applicable).',
  'Look for active alarms or fault code notifications in the cab and on the electronics display.',
];

const RATING_OPTIONS = ['Normal', 'Monitor', 'Action', 'N/A'];

const INITIAL_INSPECTIONS = [
  {
    id: '27542829',
    title: 'Daily Inspection',
    subtitle: 'Daily',
    address: '201 N Goodwin Ave, Urbana, IL',
    lastUpdate: 'Last Update: 2/28/2026, 11:15:43 AM',
    assetName: 'FAMILY-ALL',
  },
  {
    id: '27537664',
    title: 'Daily Inspection',
    subtitle: 'Daily',
    address: '201 N Goodwin Ave, Urbana, IL',
    lastUpdate: 'Last Update: 2/28/2026, 12:11:23 AM',
    assetName: 'FAMILY-ALL',
  },
];

const USER_ID_STORAGE_KEY = '@hackillinois26_user_id';

function UserIdPromptModal({ visible, userId, onUserIdChange, onContinue }) {
  const [input, setInput] = useState(userId || '');

  useEffect(() => {
    setInput(userId || '');
  }, [userId, visible]);

  const handleContinue = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onUserIdChange(trimmed);
    onContinue();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Enter your User ID</Text>
          <Text style={styles.modalSubtitle}>
            This will be used to associate inspections with you. (Google OAuth coming later.)
          </Text>
          <TextInput
            style={styles.modalInput}
            placeholder="e.g. user-123 or UUID"
            placeholderTextColor="#9E9E9E"
            value={input}
            onChangeText={setInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.primaryButton, styles.modalButton]}
            onPress={handleContinue}
            disabled={!input.trim()}
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function AppTopBar({ title, rightContent, showMenu = true, showBack = false, onBack }) {
  return (
    <View style={styles.topBar}>
      <View style={styles.topBarLeft}>
        {showBack ? (
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>{'\u2039'}</Text>
          </TouchableOpacity>
        ) : (
          showMenu && (
            <View style={styles.menuIcon}>
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
            </View>
          )
        )}
      </View>
      <View style={styles.topBarCenter}>
        <Text style={styles.topBarTitle}>{title}</Text>
      </View>
      <View style={styles.topBarRight}>{rightContent}</View>
    </View>
  );
}

function BottomTabBar({ currentTab, onChangeTab }) {
  const tabs = useMemo(
    () => [
      { key: TABS.FLEET, label: 'Fleet' },
      { key: TABS.INSPECTIONS, label: 'Inspections' },
      { key: TABS.REPORTS, label: 'Reports' },
      { key: TABS.FAVORITES, label: 'Favorites' },
    ],
    []
  );

  return (
    <View style={styles.tabBar}>
      {tabs.map(tab => {
        const isActive = tab.key === currentTab;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabItem}
            onPress={() => onChangeTab(tab.key)}
          >
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function FleetScreen({ onCreateInspection }) {
  return (
    <View style={styles.screenContainer}>
      <AppTopBar title="Fleet" rightContent={<View style={styles.topIconsPlaceholder} />} />
      <View style={styles.screenBody}>
        <View style={styles.searchContainer}>
          <TextInput placeholder="Search" style={styles.searchInput} placeholderTextColor="#999" />
        </View>
        <View style={styles.centerInfoContainer}>
          <View style={styles.infoCircle}>
            <Text style={styles.infoCircleText}>i</Text>
          </View>
          <Text style={styles.infoMessage}>No Assets Available</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={onCreateInspection}>
            <Text style={styles.primaryButtonText}>Create Inspection</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function InspectionsListScreen({ inspections, onOpenInspection, onCreateInspection }) {
  const [activeSegment, setActiveSegment] = useState('In Progress');

  const filteredInspections =
    activeSegment === 'In Progress'
      ? inspections
      : []; // Assigned/Submitted tabs show empty state for now

  const emptyMessage =
    activeSegment === 'Assigned'
      ? 'You do not have any Assigned inspections.'
      : activeSegment === 'Submitted'
      ? 'You do not have any Submitted inspections.'
      : 'You do not have any In Progress inspections.';

  return (
    <View style={styles.screenContainer}>
      <AppTopBar
        title="Inspections"
        rightContent={
          <View style={styles.inspectionTopRight}>
            <TouchableOpacity onPress={onCreateInspection}>
              <Text style={styles.iconText}>＋</Text>
            </TouchableOpacity>
            <Text style={styles.iconText}>⌂</Text>
          </View>
        }
      />
      <View style={styles.screenBody}>
        <View style={styles.segmentControl}>
          {['In Progress', 'Assigned', 'Submitted'].map(label => {
            const isActive = activeSegment === label;
            return (
              <TouchableOpacity
                key={label}
                style={[styles.segmentItem, isActive && styles.segmentItemActive]}
                onPress={() => setActiveSegment(label)}
              >
                <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.filterContainer}>
          <TextInput
            placeholder="Filter Inspections"
            style={styles.searchInput}
            placeholderTextColor="#999"
          />
        </View>

        <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
          {filteredInspections.length === 0 ? (
            <View style={styles.emptyListMessage}>
              <View style={styles.infoCircle}>
                <Text style={styles.infoCircleText}>i</Text>
              </View>
              <Text style={styles.infoMessage}>{emptyMessage}</Text>
            </View>
          ) : (
            filteredInspections.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.inspectionCard}
                onPress={() => onOpenInspection(item)}
              >
                <Text style={styles.inspectionTitle}>{item.title}</Text>
                <Text style={styles.inspectionSubtitle}>{item.subtitle}</Text>
                <Text style={styles.inspectionAddress}>{item.address}</Text>
                <Text style={styles.inspectionMeta}>
                  {item.lastUpdate}
                  {'\n'}
                  Inspection Number: {item.id}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        <TouchableOpacity
          style={[styles.primaryButton, styles.createInspectionButton]}
          onPress={onCreateInspection}
        >
          <Text style={styles.primaryButtonText}>Create Inspection</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function InspectionDetailScreen({ inspection, onBackToList, onOpenDiagram, onOpenGeneral }) {
  const assetName = inspection?.assetName || 'FAMILY-ALL';
  return (
    <View style={styles.screenContainer}>
      <AppTopBar
        title="Daily Inspection"
        showBack
        onBack={onBackToList}
        rightContent={<View style={styles.syncedPillContainer} />}
      />
      <View style={styles.detailHeader}>
        <Text style={styles.detailAssetName}>{assetName}</Text>
        <View style={styles.syncedPill}>
          <Text style={styles.syncedText}>SYNCED</Text>
        </View>
      </View>
      <ScrollView style={styles.screenBody} contentContainerStyle={styles.detailContent}>
        <View style={styles.sectionBlockDisabled}>
          <Text style={styles.sectionTitleDisabled}>Assignment Notes</Text>
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeader}>Customer & Asset Info</Text>
          <Text style={styles.incompleteItem}>Incomplete - Serial Number</Text>
          <Text style={styles.incompleteItem}>Incomplete - Model</Text>
          <Text style={styles.incompleteItem}>Incomplete - Service Meter Value</Text>
          <Text style={styles.incompleteItem}>Incomplete - Service Meter Unit</Text>
        </View>

        <TouchableOpacity style={styles.sectionRow} onPress={onOpenGeneral}>
          <Text style={styles.sectionRowTitle}>General Info & Comments</Text>
        </TouchableOpacity>

        {/* AI Diagram Inspection — primary entry point */}
        <TouchableOpacity style={[styles.sectionRow, styles.diagramSectionRow]} onPress={onOpenDiagram}>
          <View style={styles.diagramSectionContent}>
            <View>
              <Text style={styles.diagramSectionTitle}>AI Walk-Around Inspection</Text>
              <Text style={styles.diagramSectionSubtitle}>
                Interactive diagram with AI photo analysis
              </Text>
            </View>
            <View style={styles.diagramSectionBadge}>
              <Text style={styles.diagramSectionBadgeText}>CAT 982M</Text>
            </View>
          </View>
          <Text style={styles.diagramSectionArrow}>›</Text>
        </TouchableOpacity>
      </ScrollView>
      <View style={styles.detailFooter}>
        <TouchableOpacity style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Reassign</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.primaryButton, styles.disabledPrimaryButton]}>
          <Text style={[styles.primaryButtonText, styles.disabledPrimaryButtonText]}>Submit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const INSPECTION_TYPES = [
  { key: 'Daily', label: 'Daily' },
  { key: 'Pre-shift', label: 'Pre-shift' },
  { key: 'Weekly', label: 'Weekly' },
];

function CreateInspectionFormScreen({ onBack, onSubmit, userId }) {
  const [inspectionType, setInspectionType] = useState('Daily');
  const [assetName, setAssetName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [location, setLocation] = useState('');
  const [assignmentNotes, setAssignmentNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!userId) {
      Alert.alert('User ID Required', 'Please enter your User ID first (shown at app start).');
      return;
    }
    setSubmitting(true);
    const now = new Date();
    const dateStr = now.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const appId = String(Math.floor(10000000 + Math.random() * 90000000));
    const row = {
      user_id: userId,
      inspection_type: inspectionType,
      asset_name: assetName || 'FAMILY-ALL',
      serial_number: serialNumber || null,
      location: location || 'No location specified',
      assignment_notes: assignmentNotes || '',
      app_id: appId,
    };

    const { error } = await supabase.from('inspections').insert(row);
    if (error) {
      setSubmitting(false);
      Alert.alert('Save Failed', error.message || 'Could not save to Supabase.');
      return;
    }

    setSubmitting(false);
    onSubmit({
      id: appId,
      title: `${inspectionType} Inspection`,
      subtitle: inspectionType,
      address: location || 'No location specified',
      lastUpdate: `Last Update: ${dateStr}`,
      assetName: assetName || 'FAMILY-ALL',
      serialNumber: serialNumber || null,
      assignmentNotes: assignmentNotes || '',
    });
  };

  return (
    <View style={styles.screenContainer}>
      <AppTopBar title="Create Inspection" showBack onBack={onBack} />
      <ScrollView style={styles.screenBody} contentContainerStyle={styles.createFormContent}>
        <Text style={styles.createFormLabel}>Inspection Type</Text>
        <View style={styles.createFormTypeRow}>
          {INSPECTION_TYPES.map(type => (
            <TouchableOpacity
              key={type.key}
              style={[
                styles.createFormTypeChip,
                inspectionType === type.key && styles.createFormTypeChipActive,
              ]}
              onPress={() => setInspectionType(type.key)}
            >
              <Text
                style={[
                  styles.createFormTypeChipText,
                  inspectionType === type.key && styles.createFormTypeChipTextActive,
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.createFormLabel}>Asset / Equipment Name</Text>
        <TextInput
          style={styles.createFormInput}
          placeholder="e.g. Excavator 12, FAMILY-ALL"
          placeholderTextColor="#9E9E9E"
          value={assetName}
          onChangeText={setAssetName}
        />

        <Text style={styles.createFormLabel}>Serial Number</Text>
        <TextInput
          style={styles.createFormInput}
          placeholder="e.g. SN-12345"
          placeholderTextColor="#9E9E9E"
          value={serialNumber}
          onChangeText={setSerialNumber}
        />

        <Text style={styles.createFormLabel}>Location</Text>
        <TextInput
          style={styles.createFormInput}
          placeholder="Address or site name"
          placeholderTextColor="#9E9E9E"
          value={location}
          onChangeText={setLocation}
        />

        <Text style={styles.createFormLabel}>Assignment Notes (optional)</Text>
        <TextInput
          style={[styles.createFormInput, styles.createFormInputMultiline]}
          placeholder="Add any notes for this inspection..."
          placeholderTextColor="#9E9E9E"
          value={assignmentNotes}
          onChangeText={setAssignmentNotes}
          multiline
          numberOfLines={3}
        />

        <TouchableOpacity
          style={[styles.primaryButton, styles.createFormSubmit]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.primaryButtonText}>
            {submitting ? 'Saving...' : 'Create Inspection'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function RatingPill({ label, isActive, color, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.ratingPill,
        { borderColor: color },
        isActive && { backgroundColor: color },
      ]}
    >
      <Text style={[styles.ratingPillText, isActive && styles.ratingPillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function GeneralInfoScreen({ onBack }) {
  const [selectedRating, setSelectedRating] = useState(null);

  const ratingColors = {
    Normal: '#2E7D32',
    Monitor: '#FBC02D',
    Action: '#C62828',
    'N/A': '#9E9E9E',
  };

  return (
    <View style={styles.screenContainer}>
      <AppTopBar title="General Info & Comments" showBack onBack={onBack} />
      <ScrollView style={styles.screenBody} contentContainerStyle={styles.generalContent}>
        <Text style={styles.sectionHeader}>Rating</Text>
        <View style={styles.ratingRow}>
          {RATING_OPTIONS.map(option => (
            <RatingPill
              key={option}
              label={option}
              color={ratingColors[option]}
              isActive={selectedRating === option}
              onPress={() => setSelectedRating(option)}
            />
          ))}
        </View>

        <Text style={styles.sectionHeader}>Comments</Text>
        <View style={styles.commentBox}>
          <Text style={styles.commentPlaceholder}>Add comments</Text>
        </View>

        <View>
          <Text style={styles.sectionHeader}>Media</Text>
          <View style={styles.mediaRow}>
            <TouchableOpacity style={styles.mediaButton}>
              <Text style={styles.mediaButtonText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaButton}>
              <Text style={styles.mediaButtonText}>HD</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.mediaRow}>
            <TouchableOpacity style={styles.mediaButton}>
              <Text style={styles.mediaButtonText}>Take Video</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaButton}>
              <Text style={styles.mediaButtonText}>Upload Attachment</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.uploadedLabel}>Uploaded</Text>
          <Text style={styles.uploadedEmpty}>No images or documents uploaded</Text>
        </View>
      </ScrollView>
      <View style={styles.detailFooter}>
        <TouchableOpacity style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Previous</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function WalkAroundScreen({ onBack }) {
  const [ratings, setRatings] = useState({});

  const setItemRating = (index, rating) => {
    setRatings(prev => ({ ...prev, [index]: rating }));
  };

  const ratingColors = {
    Normal: '#2E7D32',
    Monitor: '#FBC02D',
    Action: '#C62828',
    'N/A': '#9E9E9E',
  };

  return (
    <View style={styles.screenContainer}>
      <AppTopBar title="Walk Around" showBack onBack={onBack} />
      <ScrollView style={styles.screenBody} contentContainerStyle={styles.walkAroundContent}>
        {WALK_AROUND_ITEMS.map((question, index) => (
          <View key={index} style={styles.walkItem}>
            <Text style={styles.walkItemNumber}>{`1.${index + 1}`}</Text>
            <Text style={styles.walkItemQuestion}>{question}</Text>
            <View style={styles.walkRatingRow}>
              {RATING_OPTIONS.map(option => (
                <TouchableOpacity
                  key={option}
                  style={styles.walkRatingOption}
                  onPress={() => setItemRating(index, option)}
                >
                  <View
                    style={[
                      styles.walkRadioOuter,
                      ratings[index] === option && {
                        borderColor: ratingColors[option],
                      },
                    ]}
                  >
                    {ratings[index] === option && (
                      <View
                        style={[
                          styles.walkRadioInner,
                          { backgroundColor: ratingColors[option] },
                        ]}
                      />
                    )}
                  </View>
                  <Text style={styles.walkRatingLabel}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.detailFooter}>
        <TouchableOpacity style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Previous</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ReportsScreen() {
  return (
    <View style={styles.screenContainer}>
      <AppTopBar title="Reports" rightContent={<View style={styles.topIconsPlaceholder} />} />
      <View style={styles.screenBody}>
        <View style={styles.centerInfoContainer}>
          <View style={styles.infoCircle}>
            <Text style={styles.infoCircleText}>i</Text>
          </View>
          <Text style={styles.infoMessage}>
            You do not have any inspection reports to show at this time.
          </Text>
        </View>
      </View>
    </View>
  );
}

function FavoritesScreen() {
  return (
    <View style={styles.screenContainer}>
      <AppTopBar title="Favorites" rightContent={<View style={styles.topIconsPlaceholder} />} />
      <View style={styles.screenBody}>
        <View style={styles.segmentControl}>
          <View style={[styles.segmentItem, styles.segmentItemActive]}>
            <Text style={[styles.segmentText, styles.segmentTextActive]}>Favorites</Text>
          </View>
          <View style={styles.segmentItem}>
            <Text style={styles.segmentText}>History</Text>
          </View>
        </View>
        <View style={styles.centerInfoContainer}>
          <View style={styles.infoCircle}>
            <Text style={styles.infoCircleText}>i</Text>
          </View>
          <Text style={styles.infoMessage}>
            You do not have any favorites to show at this time.
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function App() {
  const [currentTab, setCurrentTab] = useState(TABS.INSPECTIONS);
  const [inspectionScreen, setInspectionScreen] = useState(INSPECTION_SCREENS.LIST);
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [inspections, setInspections] = useState(INITIAL_INSPECTIONS);
  const [userId, setUserId] = useState(null);
  const [userIdLoaded, setUserIdLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(USER_ID_STORAGE_KEY)
      .then(stored => {
        const value = stored && String(stored).trim() ? String(stored).trim() : null;
        setUserId(value);
      })
      .catch(() => setUserId(null))
      .finally(() => setUserIdLoaded(true));
  }, []);

  const handleUserIdChange = newId => {
    setUserId(newId);
    AsyncStorage.setItem(USER_ID_STORAGE_KEY, newId);
  };

  const handleUserIdContinue = () => {
    // Modal closes because userId is now set
  };

  const handleOpenInspection = inspection => {
    setSelectedInspection(inspection);
    setInspectionScreen(INSPECTION_SCREENS.DETAIL);
  };

  const handleOpenCreateForm = () => {
    if (currentTab !== TABS.INSPECTIONS) {
      setCurrentTab(TABS.INSPECTIONS);
    }
    setInspectionScreen(INSPECTION_SCREENS.CREATE);
  };

  const handleCreateInspectionSubmit = newInspection => {
    setInspections(prev => [newInspection, ...prev]);
    setSelectedInspection(newInspection);
    setInspectionScreen(INSPECTION_SCREENS.DETAIL);
  };

  const renderInspectionStack = () => {
    if (inspectionScreen === INSPECTION_SCREENS.LIST) {
      return (
        <InspectionsListScreen
          inspections={inspections}
          onOpenInspection={handleOpenInspection}
          onCreateInspection={handleOpenCreateForm}
        />
      );
    }

    if (inspectionScreen === INSPECTION_SCREENS.CREATE) {
      return (
        <CreateInspectionFormScreen
          userId={userId}
          onBack={() => setInspectionScreen(INSPECTION_SCREENS.LIST)}
          onSubmit={handleCreateInspectionSubmit}
        />
      );
    }

    if (inspectionScreen === INSPECTION_SCREENS.DETAIL) {
      return (
        <InspectionDetailScreen
          inspection={selectedInspection}
          onBackToList={() => setInspectionScreen(INSPECTION_SCREENS.LIST)}
          onOpenDiagram={() => setInspectionScreen(INSPECTION_SCREENS.DIAGRAM)}
          onOpenGeneral={() => setInspectionScreen(INSPECTION_SCREENS.GENERAL_INFO)}
        />
      );
    }

    if (inspectionScreen === INSPECTION_SCREENS.DIAGRAM) {
      return (
        <DiagramScreen
          inspection={selectedInspection}
          onBack={() => setInspectionScreen(INSPECTION_SCREENS.DETAIL)}
        />
      );
    }

    if (inspectionScreen === INSPECTION_SCREENS.WALK_AROUND) {
      return <WalkAroundScreen onBack={() => setInspectionScreen(INSPECTION_SCREENS.DETAIL)} />;
    }

    if (inspectionScreen === INSPECTION_SCREENS.GENERAL_INFO) {
      return <GeneralInfoScreen onBack={() => setInspectionScreen(INSPECTION_SCREENS.DETAIL)} />;
    }

    return null;
  };

  const renderCurrentTab = () => {
    switch (currentTab) {
      case TABS.FLEET:
        return <FleetScreen onCreateInspection={handleOpenCreateForm} />;
      case TABS.INSPECTIONS:
        return renderInspectionStack();
      case TABS.REPORTS:
        return <ReportsScreen />;
      case TABS.FAVORITES:
        return <FavoritesScreen />;
      default:
        return null;
    }
  };

  // DiagramScreen is full-screen; hide the tab bar when it's active
  const isDiagramActive =
    currentTab === TABS.INSPECTIONS && inspectionScreen === INSPECTION_SCREENS.DIAGRAM;

  return (
    <InspectionProvider>
      <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.appShell}>
          {renderCurrentTab()}
          {!isDiagramActive && (
            <BottomTabBar currentTab={currentTab} onChangeTab={setCurrentTab} />
          )}
        </View>
        {userIdLoaded && (
          <UserIdPromptModal
            visible={!userId}
            userId={userId}
            onUserIdChange={handleUserIdChange}
            onContinue={handleUserIdContinue}
          />
        )}
      </SafeAreaView>
      </SafeAreaProvider>
    </InspectionProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#000',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#616161',
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#000',
    marginBottom: 20,
  },
  modalButton: {
    alignSelf: 'stretch',
  },
  appShell: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    height: 56,
    backgroundColor: '#000',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  topBarLeft: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  topBarCenter: {
    flex: 1,
    alignItems: 'center',
  },
  topBarRight: {
    width: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  topBarTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  menuIcon: {
    width: 22,
    justifyContent: 'space-between',
    height: 16,
  },
  menuLine: {
    height: 2,
    backgroundColor: '#fff',
    borderRadius: 1,
  },
  backButton: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  backText: {
    color: '#fff',
    fontSize: 30,
    lineHeight: 30,
  },
  topIconsPlaceholder: {
    width: 1,
    height: 1,
  },
  inspectionTopRight: {
    flexDirection: 'row',
    gap: 8,
  },
  iconText: {
    color: '#fff',
    fontSize: 18,
  },
  screenContainer: {
    flex: 1,
    backgroundColor: '#111',
  },
  screenBody: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  searchContainer: {
    padding: 16,
  },
  searchInput: {
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#000',
  },
  centerInfoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  infoCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoCircleText: {
    color: '#BDBDBD',
    fontSize: 20,
    fontWeight: '500',
  },
  infoMessage: {
    textAlign: 'center',
    color: '#757575',
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: '#FFD600',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 15,
  },
  tabBar: {
    height: 64,
    backgroundColor: '#000',
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    color: '#9E9E9E',
    fontSize: 12,
  },
  tabLabelActive: {
    color: '#FFD600',
    fontWeight: '600',
  },
  segmentControl: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemActive: {
    backgroundColor: '#fff',
  },
  segmentText: {
    fontSize: 12,
    color: '#616161',
  },
  segmentTextActive: {
    color: '#000',
    fontWeight: '600',
  },
  filterContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  listScroll: {
    flex: 1,
    marginTop: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  emptyListMessage: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  inspectionCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 2,
  },
  inspectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  inspectionSubtitle: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 8,
  },
  inspectionAddress: {
    fontSize: 12,
    color: '#424242',
    marginBottom: 8,
  },
  inspectionMeta: {
    fontSize: 11,
    color: '#9E9E9E',
  },
  createInspectionButton: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
  },
  detailHeader: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailAssetName: {
    fontSize: 16,
    fontWeight: '600',
  },
  syncedPillContainer: {},
  syncedPill: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  syncedText: {
    fontSize: 11,
    color: '#2E7D32',
    fontWeight: '600',
  },
  detailContent: {
    padding: 16,
    paddingBottom: 96,
  },
  sectionBlockDisabled: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#E0E0E0',
    marginBottom: 12,
  },
  sectionTitleDisabled: {
    color: '#9E9E9E',
    fontWeight: '600',
    fontSize: 14,
  },
  sectionBlock: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  incompleteItem: {
    fontSize: 12,
    color: '#D32F2F',
    marginTop: 2,
  },
  sectionRow: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  sectionRowTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionRowSubtitle: {
    fontSize: 12,
    color: '#9E9E9E',
  },
  detailFooter: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    alignItems: 'center',
    marginRight: 8,
  },
  secondaryButtonText: {
    color: '#424242',
    fontWeight: '600',
  },
  disabledPrimaryButton: {
    flex: 1,
    marginLeft: 8,
    backgroundColor: '#FFE082',
  },
  disabledPrimaryButtonText: {
    color: '#757575',
  },
  ratingPill: {
    flex: 1,
    marginRight: 8,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  ratingPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#424242',
  },
  ratingPillTextActive: {
    color: '#fff',
  },
  ratingRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  generalContent: {
    padding: 16,
    paddingBottom: 96,
  },
  commentBox: {
    minHeight: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    padding: 8,
    marginBottom: 16,
    justifyContent: 'center',
  },
  commentPlaceholder: {
    color: '#9E9E9E',
    fontSize: 13,
  },
  mediaRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  mediaButton: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    paddingVertical: 10,
    alignItems: 'center',
    marginRight: 8,
  },
  mediaButtonText: {
    fontSize: 13,
    color: '#424242',
    fontWeight: '500',
  },
  uploadedLabel: {
    marginTop: 12,
    fontSize: 12,
    color: '#757575',
  },
  uploadedEmpty: {
    fontSize: 12,
    color: '#BDBDBD',
    marginTop: 4,
  },
  walkAroundContent: {
    padding: 16,
    paddingBottom: 96,
  },
  walkItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  walkItemNumber: {
    fontSize: 12,
    color: '#9E9E9E',
    marginBottom: 4,
  },
  walkItemQuestion: {
    fontSize: 13,
    color: '#424242',
    marginBottom: 12,
  },
  walkRatingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  walkRatingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '50%',
    marginBottom: 8,
  },
  walkRadioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#BDBDBD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  walkRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  walkRatingLabel: {
    fontSize: 12,
    color: '#424242',
  },
  createFormContent: {
    padding: 16,
    paddingBottom: 32,
  },
  createFormLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 8,
    marginTop: 16,
  },
  createFormInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#000',
  },
  createFormInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  createFormTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  createFormTypeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#E0E0E0',
    marginRight: 8,
    marginBottom: 8,
  },
  createFormTypeChipActive: {
    backgroundColor: '#FFD600',
  },
  createFormTypeChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#616161',
  },
  createFormTypeChipTextActive: {
    color: '#000',
    fontWeight: '600',
  },
  createFormSubmit: {
    marginTop: 32,
    borderRadius: 8,
  },

  // ── Diagram entry row in InspectionDetailScreen ───────────────────────────
  diagramSectionRow: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#FFD600',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  diagramSectionContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  diagramSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFD600',
    marginBottom: 2,
  },
  diagramSectionSubtitle: {
    fontSize: 12,
    color: '#888',
  },
  diagramSectionBadge: {
    backgroundColor: '#FFD600',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  diagramSectionBadgeText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '700',
  },
  diagramSectionArrow: {
    color: '#FFD600',
    fontSize: 22,
    marginLeft: 8,
  },
});
