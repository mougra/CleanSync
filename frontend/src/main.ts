import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './styles/main.css';

import PrimeVue from 'primevue/config';
import Aura from '@primeuix/themes/aura';
import 'primeicons/primeicons.css';
import 'primeflex/primeflex.css';

import { createPinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createHead } from '@unhead/vue';

const app = createApp(App);

const pinia = createPinia();
const head = createHead();

app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.dark',
    },
  },
});
app.use(router);
app.use(pinia);
app.use(VueQueryPlugin);
app.use(head);

app.mount('#app');
