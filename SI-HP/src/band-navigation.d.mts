import type { LocationQuery, Router, NavigationFailure } from 'vue-router'
export interface BandNavigationSettings { discoveryEnabled?: boolean }
export function readBandNavigation(query: LocationQuery, settings?: BandNavigationSettings): { bandId: string; browsing: boolean }
export function createBandNavigation(router: Router, settings?: BandNavigationSettings): {
  home(): Promise<void | NavigationFailure>
  browse(): Promise<void | NavigationFailure>
  select(id: string): Promise<void | NavigationFailure>
}
