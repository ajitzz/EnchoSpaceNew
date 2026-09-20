/** Reject ASCII controls without changing the accepted Unicode text alphabet. */
export function hasAsciiControl(value: string, includeDelete = false): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 31 || (includeDelete && code === 127)) return true;
  }
  return false;
}
