namespace PathUtil {
  export type ValidationResult =
    | { valid: true }
    | { valid: false; message: string };

  export function joinPath(...parts: string[]): string {
    if (parts.length === 0) return '';

    const isWindows = /^[A-Za-z]:\\/.test(parts[0]);
    const separator = isWindows ? '\\' : '/';

    return parts
      .map((p, i) => {
        if (i === 0) return p.replace(/[\\/]+$/, '');
        return p.replace(/^[\\/]+|[\\/]+$/g, '');
      })
      .join(separator);
  }

  export function dirname(path: string): string {
    if (!path) return '';

    const normalized = path.replace(/\\/g, '/');
    const isWindowsDrive = /^[A-Za-z]:\//.test(normalized);

    let trimmed = normalized;
    if (trimmed.length > 1) {
      trimmed = trimmed.replace(/\/+$/, '');
    }

    if (trimmed === '/') return '/';
    if (isWindowsDrive && trimmed.length === 3) {
      return trimmed.replace(/\//g, '\\');
    }

    const lastSlash = trimmed.lastIndexOf('/');

    if (lastSlash === -1) return '';

    const dir = trimmed.slice(0, lastSlash);

    if (isWindowsDrive) {
      return dir.replace(/\//g, '\\');
    }

    return dir || '/';
  }

  export function basename(path: string): string {
    if (!path) return '';

    const normalized = path.replace(/\\/g, '/');

    let trimmed = normalized;
    if (trimmed.length > 1) {
      trimmed = trimmed.replace(/\/+$/, '');
    }

    if (trimmed === '/') return '/';

    const lastSlash = trimmed.lastIndexOf('/');

    if (lastSlash === -1) return trimmed;

    return trimmed.slice(lastSlash + 1);
  }

  export function extname(path: string): string {
    const base = basename(path);

    if (!base) return '';

    const lastDot = base.lastIndexOf('.');

    // ".gitignore" のようなケースは拡張子なし扱い
    if (lastDot <= 0) return '';

    return base.slice(lastDot);
  }

  export function isAbsolute(path: string): boolean {
    if (!path) return false;

    // Unix
    if (path.startsWith('/')) return true;

    // Windows
    if (/^[A-Za-z]:[\\/]/.test(path)) return true;

    return false;
  }

  export function normalize(path: string): string {
    if (!path) return '';

    const isWindows = /^[A-Za-z]:[\\/]/.test(path);
    const unified = path.replace(/\\/g, '/');

    const driveMatch = unified.match(/^([A-Za-z]:)(\/.*)?$/);
    const drive = driveMatch ? driveMatch[1] : '';
    const rest = driveMatch ? driveMatch[2] || '' : unified;

    const isRooted = rest.startsWith('/');

    const segments = rest.split('/');

    const stack: string[] = [];

    for (const seg of segments) {
      if (!seg || seg === '.') continue;

      if (seg === '..') {
        if (stack.length > 0 && stack[stack.length - 1] !== '..') {
          stack.pop();
        } else if (!isRooted) {
          stack.push('..');
        }
      } else {
        stack.push(seg);
      }
    }

    let result = (isRooted ? '/' : '') + stack.join('/');

    if (drive) {
      result = drive + result;
    }

    if (!result) {
      if (drive) return drive + '/';
      return isRooted ? '/' : '.';
    }

    if (isWindows) {
      return result.replace(/\//g, '\\');
    }

    return result;
  }

  export function samePath(a: string, b: string): boolean {
    const na = normalize(a);
    const nb = normalize(b);

    const isWindows = /^[A-Za-z]:[\\/]/.test(na) || /^[A-Za-z]:[\\/]/.test(nb);

    if (isWindows) {
      return na.toLowerCase() === nb.toLowerCase();
    }

    return na === nb;
  }

  /**
   * ancestorがdescendantの親階層かどうかを判定する
   */
  export const isAncestor = (ancestor: string, descendant: string): boolean => {
    if (!descendant.startsWith(ancestor)) {
      return false;
    }
    const nextChar = descendant.charAt(ancestor.length);
    return nextChar === '/' || nextChar === '\\';
  };

  const WINDOWS_INVALID_NAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/;
  const WINDOWS_RESERVED_NAMES =
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

  export function validateWindowsFileName(name: string): ValidationResult {
    if (name.length === 0) {
      return { valid: false, message: 'File name must not be empty.' };
    }

    if (name === '.' || name === '..') {
      return {
        valid: false,
        message: `File name is reserved: ${name}`,
      };
    }

    const invalid = name.match(WINDOWS_INVALID_NAME_CHARS)?.[0];
    if (invalid != null) {
      return {
        valid: false,
        message: `File name contains invalid Windows character "${formatInvalidChar(invalid)}": ${name}`,
      };
    }

    if (/[. ]$/.test(name)) {
      return {
        valid: false,
        message: `File name cannot end with a dot or space: ${name}`,
      };
    }

    if (WINDOWS_RESERVED_NAMES.test(name)) {
      return {
        valid: false,
        message: `File name is reserved on Windows: ${name}`,
      };
    }

    return { valid: true };
  }

  export function validateWindowsPath(path: string): ValidationResult {
    if (path.trim().length === 0) {
      return { valid: false, message: 'Path must not be empty.' };
    }

    const normalized = normalize(path);
    const withoutPrefix = stripWindowsPathPrefix(normalized);
    const segments = withoutPrefix.split(/[\\/]+/).filter((seg) => seg !== '');

    for (const segment of segments) {
      const result = validateWindowsFileName(segment);
      if (!result.valid) {
        return {
          valid: false,
          message: `${result.message} Path: ${path}`,
        };
      }
    }

    return { valid: true };
  }

  function stripWindowsPathPrefix(path: string): string {
    const normalized = path.replace(/\//g, '\\');

    if (/^[A-Za-z]:\\?/.test(normalized)) {
      return normalized.slice(2);
    }

    if (normalized.startsWith('\\\\?\\')) {
      const withoutExtendedPrefix = normalized.slice(4);
      if (/^[A-Za-z]:\\?/.test(withoutExtendedPrefix)) {
        return withoutExtendedPrefix.slice(2);
      }
      return withoutExtendedPrefix.replace(/^UNC\\[^\\]+\\[^\\]+\\?/, '');
    }

    if (normalized.startsWith('\\\\')) {
      const parts = normalized.split('\\').filter((part) => part !== '');
      return parts.slice(2).join('\\');
    }

    return normalized;
  }

  function formatInvalidChar(char: string): string {
    const code = char.charCodeAt(0);
    if (code < 32) {
      return `0x${code.toString(16).padStart(2, '0')}`;
    }
    return char;
  }
}

export default PathUtil;
