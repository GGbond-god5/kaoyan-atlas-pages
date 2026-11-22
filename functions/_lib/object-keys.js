// R2 对象归属判断：注销和单文件删除共用，避免把社区导入记录误当成对象所有者。
export function ownsUserObjectKey(uid, key) {
  if (typeof uid !== 'string' || !uid || typeof key !== 'string' || !key) return false;
  return key === `avatars/${uid}` ||
    key.startsWith(`library/${uid}/`) ||
    key.startsWith(`library-tmp/${uid}/`) ||
    key.startsWith(`${uid}/`) ||
    key.startsWith(`${uid}-`);
}
