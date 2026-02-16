/**
 * App State Types for Persistence Layer
 * Manages application-level state that persists between sessions
 */

/**
 * Window bounds for restoring window position/size
 */
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Application state that persists between sessions
 */
export interface AppState {
  /**
   * ID of the last active project
   */
  lastActiveProjectId: string;
  
  /**
   * Window position and dimensions for restoration
   */
  windowBounds?: WindowBounds;
  
  /**
   * Split pane sizes for layout restoration
   */
  panelSizes?: number[];
  
  /**
   * Application version that created this state
   */
  appVersion: string;
  
  /**
   * ISO timestamp of when app was last opened
   */
  lastOpened: string;
}

/**
 * Default app state for new installations
 */
export const DEFAULT_APP_STATE: AppState = {
  lastActiveProjectId: '',
  appVersion: '1.0.0',
  lastOpened: new Date().toISOString(),
};