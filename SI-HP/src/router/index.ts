import { createRouter, createWebHashHistory } from 'vue-router'
import WorksPage from '../views/WorksPage.vue'
import BoothPage from '../views/BoothPage.vue'
import ContactPage from '../views/ContactPage.vue'
import TouPage from '../views/TouPage.vue'
import YoutubePage from '../views/YoutubePage.vue'
import FormPage from '../views/FormPage.vue'
import TopPage from '../views/TopPage.vue'
import SchedulePage from '../views/SchedulePage.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'Top', component: TopPage },
    { path: '/works', name: 'Works', component: WorksPage },
    { path: '/booth', name: 'Booth', component: BoothPage },
    { path: '/contact', name: 'Contact', component: ContactPage },
    { path: '/tou', name: 'Tou', component: TouPage },
    { path: '/mov', name: 'Youtube', component: YoutubePage },
    { path: '/form', name: 'Form', component: FormPage },
    { path: '/schedule', name: 'Schedule', component: SchedulePage },

    // 404 対策
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

export default router
