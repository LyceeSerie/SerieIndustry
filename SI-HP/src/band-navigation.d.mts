import type { LocationQuery, Router, NavigationFailure } from 'vue-router'
export function readBandNavigation(query: LocationQuery): { bandId: string; browsing: boolean }
export function createBandNavigation(router: Router): {
  home(): Promise<void | NavigationFailure>
  browse(): Promise<void | NavigationFailure>
  select(id: string): Promise<void | NavigationFailure>
}
