import { handleWorker } from '../../_lib/platform.js';
export const onRequest = ({ request, env }) => handleWorker(request, env);
