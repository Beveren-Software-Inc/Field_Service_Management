import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'
import proxyOptions from './proxyOptions';

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react()],
	server: {
		port: 8080,
		host: '0.0.0.0',
		proxy: proxyOptions
	},
	resolve: {
		alias: {
			'@': new URL('./src', import.meta.url).pathname
		}
	},
	build: {
		outDir: '../beveren_fsm/public/schedule',
		emptyOutDir: true,
		target: 'es2015',
	},
});
