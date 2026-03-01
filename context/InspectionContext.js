import React, { createContext, useContext, useReducer, useCallback, useState } from 'react';
import { ALL_INSPECTION_POINTS } from '../data/inspectionData';

/**
 * Inspection point statuses
 * 'pending'  → grey dot  (not yet inspected)
 * 'good'     → green dot (✓)
 * 'monitor'  → orange dot (✗)
 * 'action'   → red dot   (!)
 */

const buildInitialState = () => {
  const state = {};
  for (const pt of ALL_INSPECTION_POINTS) {
    state[pt.id] = {
      status: 'pending',
      notes: '',
      photos: [],
      // Each photo: { id, uri, processing: bool, evaluation: null | { verdict, issues[], bboxes[] }, description }
    };
  }
  return state;
};

const ACTION = {
  SET_STATUS: 'SET_STATUS',
  SET_NOTES: 'SET_NOTES',
  ADD_PHOTO: 'ADD_PHOTO',
  UPDATE_PHOTO_EVALUATION: 'UPDATE_PHOTO_EVALUATION',
  REMOVE_PHOTO: 'REMOVE_PHOTO',
  RESET: 'RESET',
};

function reducer(state, action) {
  switch (action.type) {
    case ACTION.SET_STATUS:
      return {
        ...state,
        [action.pointId]: { ...state[action.pointId], status: action.status },
      };

    case ACTION.SET_NOTES:
      return {
        ...state,
        [action.pointId]: { ...state[action.pointId], notes: action.notes },
      };

    case ACTION.ADD_PHOTO: {
      const existing = state[action.pointId];
      return {
        ...state,
        [action.pointId]: {
          ...existing,
          photos: [
            ...existing.photos,
            {
              id: action.photo.id,
              uri: action.photo.uri,
              processing: true,
              evaluation: null,
              description: '',
            },
          ],
        },
      };
    }

    case ACTION.UPDATE_PHOTO_EVALUATION: {
      const existing = state[action.pointId];
      return {
        ...state,
        [action.pointId]: {
          ...existing,
          photos: existing.photos.map((p) =>
            p.id === action.photoId
              ? {
                  ...p,
                  processing: false,
                  evaluation: action.evaluation,
                  description: action.description,
                }
              : p
          ),
          // Auto-update notes from first AI description if notes are still empty
          notes:
            existing.notes === '' && action.description
              ? action.description
              : existing.notes,
          // Auto-update status from consensus verdict if still pending
          status:
            existing.status === 'pending' && action.autoStatus
              ? action.autoStatus
              : existing.status,
        },
      };
    }

    case ACTION.REMOVE_PHOTO: {
      const existing = state[action.pointId];
      return {
        ...state,
        [action.pointId]: {
          ...existing,
          photos: existing.photos.filter((p) => p.id !== action.photoId),
        },
      };
    }

    case ACTION.RESET:
      return buildInitialState();

    default:
      return state;
  }
}

const InspectionContext = createContext(null);

export function InspectionProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, buildInitialState);
  // UUID of the currently-active inspection row in Supabase (null until resolved)
  const [inspectionDbId, setInspectionDbId] = useState(null);

  const setStatus = useCallback((pointId, status) => {
    dispatch({ type: ACTION.SET_STATUS, pointId, status });
  }, []);

  const setNotes = useCallback((pointId, notes) => {
    dispatch({ type: ACTION.SET_NOTES, pointId, notes });
  }, []);

  const addPhoto = useCallback((pointId, photo) => {
    dispatch({ type: ACTION.ADD_PHOTO, pointId, photo });
  }, []);

  const updatePhotoEvaluation = useCallback(
    (pointId, photoId, evaluation, description, autoStatus) => {
      dispatch({
        type: ACTION.UPDATE_PHOTO_EVALUATION,
        pointId,
        photoId,
        evaluation,
        description,
        autoStatus,
      });
    },
    []
  );

  const removePhoto = useCallback((pointId, photoId) => {
    dispatch({ type: ACTION.REMOVE_PHOTO, pointId, photoId });
  }, []);

  const resetInspection = useCallback(() => {
    dispatch({ type: ACTION.RESET });
  }, []);

  /** Derive summary counts for repair list */
  const getActionItems = useCallback(() => {
    const items = [];
    for (const [pointId, pointState] of Object.entries(state)) {
      if (pointState.status === 'action' || pointState.status === 'monitor') {
        items.push({ pointId, ...pointState });
      }
    }
    // Sort: action first, then monitor
    items.sort((a, b) => {
      if (a.status === 'action' && b.status !== 'action') return -1;
      if (b.status === 'action' && a.status !== 'action') return 1;
      return 0;
    });
    return items;
  }, [state]);

  return (
    <InspectionContext.Provider
      value={{
        state,
        setStatus,
        setNotes,
        addPhoto,
        updatePhotoEvaluation,
        removePhoto,
        resetInspection,
        getActionItems,
        inspectionDbId,
        setInspectionDbId,
      }}
    >
      {children}
    </InspectionContext.Provider>
  );
}

export function useInspection() {
  const ctx = useContext(InspectionContext);
  if (!ctx) throw new Error('useInspection must be used within an InspectionProvider');
  return ctx;
}
