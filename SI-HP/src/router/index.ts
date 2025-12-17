import { createRouter, createWebHistory } from 'vue-router'
import WorksPage from '../views/WorksPage.vue'
import BoothPage from '../views/BoothPage.vue'
import ContactPage from '../views/ContactPage.vue'
import TouPage from '../views/TouPage.vue'
import YoutubePage from '../views/YoutubePage.vue'
import FormPage from '../views/FormPage.vue'
import TopPage from '../views/TopPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      children: [
        { path: '', name: 'Top', component: TopPage },
        { path: '/works', name: 'Works', component: WorksPage },
        { path: '/Booth', name: 'Booth', component: BoothPage },
        { path: '/Contact', name: 'Contact', component: ContactPage },
        { path: '/Tou', name: 'Tou', component: TouPage },
        { path: '/Mov', name: 'Youtube', component: YoutubePage },
        { path: '/Form', name: 'Form', component: FormPage },
      ]
    },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

export default router
