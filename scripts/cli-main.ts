/** 是否以 tsx/node 直接运行该脚本（打包进 Electron 时为 false） */
export function isDirectCliInvocation(scriptBasename: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return entry.endsWith(scriptBasename) || entry.replace(/\\/g, "/").endsWith(`/scripts/${scriptBasename}`);
}
