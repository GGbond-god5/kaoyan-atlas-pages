import { handle } from '../../_lib/platform.js';
export const onRequestPost = ({request,env,params}) => handle(request,env,'aiTest',params);
