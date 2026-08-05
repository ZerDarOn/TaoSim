import { createApp } from 'vue';
import App from './App.vue';
import { setupPlugins } from './plugins';
import './styles/global.css';

const app = createApp(App);
setupPlugins(app);
app.mount('#app');
