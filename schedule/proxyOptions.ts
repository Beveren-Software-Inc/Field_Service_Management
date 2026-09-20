import common_site_config from '../../../sites/common_site_config.json';

const { webserver_port } = common_site_config;

export default {
	'^/(app|api|assets|files|private)': {
		target: `http://127.0.0.1:${webserver_port}`,
		ws: true,
		router: function(req: { headers: { host?: string | null } }) {
			const site_name = req.headers.host?.split(':')[0] ?? '';
			return `http://${site_name}:${webserver_port}`;
		}
	}
};
