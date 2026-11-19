import { handle } from '../../_lib/platform.js';
export const onRequest = ({request,env,params}) => handle(request,env,'wrongbookExport',params);
