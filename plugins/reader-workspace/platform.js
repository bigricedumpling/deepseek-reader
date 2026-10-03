import os from 'node:os'
import path from 'node:path'

/** Platform-specific application data, independent of the plugin install. */
export function readerDataDirectory(platform = process.platform, env = process.env, home = os.homedir()) {
  const paths = platform === 'win32' ? path.win32 : path.posix
  if (env.DSH_READER_DATA_DIR) return paths.resolve(env.DSH_READER_DATA_DIR)
  const base = platform === 'darwin' ? paths.join(home, 'Library', 'Application Support')
    : platform === 'win32' ? env.APPDATA || paths.join(home, 'AppData', 'Roaming')
      : env.XDG_DATA_HOME || paths.join(home, '.local', 'share')
  return paths.join(base, 'Reader', '知识库')
}
