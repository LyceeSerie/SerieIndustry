import { createRouter, createWebHashHistory } from 'vue-router'
import WorksPage from '../views/WorksPage.vue'
import BoothPage from '../views/BoothPage.vue'
import ContactPage from '../views/ContactPage.vue'
import TouPage from '../views/TouPage.vue'
import YoutubePage from '../views/YoutubePage.vue'
import FormPage from '../views/FormPage.vue'
import TopPage from '../views/TopPage.vue'
import PrivacyPage from '../views/PrivacyPage.vue'
import SchedulePage from '../views/SchedulePage.vue'
import BandEventDetailPage from '../views/BandEventDetailPage.vue'
import BandEventsPage from '../views/BandEventsPage.vue'
import VRCBandDBPage from '../views/VRCBandDBPage.vue'

const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior(to, from, savedPosition) {
    if (to.name === 'VRCBandDB' && from.name === 'VRCBandDB') return savedPosition || { top: 0 }
  },
  routes: [
    { path: '/', name: 'Top', component: TopPage },
    { path: '/privacy', name: 'Privacy', component: PrivacyPage },
    { path: '/works', name: 'Works', component: WorksPage },
    { path: '/booth', name: 'Booth', component: BoothPage },
    { path: '/contact', name: 'Contact', component: ContactPage },
    { path: '/tou', name: 'Tou', component: TouPage },
    { path: '/mov', name: 'Youtube', component: YoutubePage },
    { path: '/form', name: 'Form', component: FormPage },
    { path: '/schedule', name: 'Schedule', component: SchedulePage },
    { path: '/VRCBandDB/events/:eventId', name: 'BandEventDetail', component: BandEventDetailPage },
    { path: '/VRCBandDB/events', name: 'BandEvents', component: BandEventsPage },
    { path: '/VRCBandDB', name: 'VRCBandDB', component: VRCBandDBPage },

    // 404 対策
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

export default router
