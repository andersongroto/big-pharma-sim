import { boot } from './ui/app.js';

const root = document.getElementById('app');
const hot = window.claude?.hot;
if (hot?.ready) hot.ready((data) => boot(root, data || {}));
else boot(root, hot?.data ?? {});
