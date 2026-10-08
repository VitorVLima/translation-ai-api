export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

export function getPasswordError(value: string): string {
  if (!value) return 'Informe uma senha.';
  if (value.length < 6) return 'A senha deve ter pelo menos 6 caracteres.';
  if (value.length > 100) return 'A senha deve ter no máximo 100 caracteres.';
  if (utf8ByteLength(value) > 72) return 'A senha excede o limite de 72 bytes.';
  return '';
}

export function getPasswordRequirements(value: string) {
  return {
    min: value.length >= 6,
    max: value.length > 0 && value.length <= 100,
    bytes: value.length > 0 && utf8ByteLength(value) <= 72,
  };
}
