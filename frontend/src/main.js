import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './app/router'
import PrimeVue from 'primevue/config'
import Button from 'primevue/button'
import TabMenu from 'primevue/tabmenu'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Card from 'primevue/card'
import Aura from '@primeuix/themes/aura'
import 'primeicons/primeicons.css'
import 'primeflex/primeflex.css'
import './styles/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      prefix: 'p',
      darkModeSelector: false,
      cssLayer: false
    }
  }
})
app.component('Button', Button)
app.component('PButton', Button)
app.component('TabMenu', TabMenu)
app.component('Dialog', Dialog)
app.component('InputText', InputText)
app.component('PInputText', InputText)
app.component('Password', Password)
app.component('PPassword', Password)
app.component('Card', Card)
app.mount('#app')
