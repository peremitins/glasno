// Проверка источника вебхуков YooKassa по официальному списку IP.
// https://yookassa.ru/developers/using-api/webhooks — раздел «Безопасность».
// Список можно переопределить через NUXT_YOOKASSA_TRUSTED_IPS (CIDR через запятую),
// либо отключить проверку в dev через NUXT_YOOKASSA_WEBHOOK_ALLOW_ALL=true.

export const YOOKASSA_DEFAULT_TRUSTED_CIDRS = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.154.128/25',
  '77.75.156.11/32',
  '77.75.156.35/32',
  '2a02:5180:0:1509::/64',
  '2a02:5180:0:2655::/64',
  '2a02:5180:0:1533::/64',
  '2a02:5180:0:2669::/64',
];

export function isTrustedYooKassaIp(
  ip: string | null | undefined,
  cidrs: string[] = YOOKASSA_DEFAULT_TRUSTED_CIDRS
): boolean {
  if (!ip) return false;
  const normalized = normalizeIp(ip.trim());
  if (!normalized) return false;
  return cidrs.some((cidr) => matchesCidr(normalized, cidr.trim()));
}

export function parseTrustedCidrsEnv(value: unknown): string[] | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
}

interface NormalizedIp {
  family: 4 | 6;
  bytes: number[];
}

// IPv4-mapped IPv6 (::ffff:1.2.3.4) приводим к IPv4.
function normalizeIp(ip: string): NormalizedIp | null {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const candidate = mapped ? mapped[1]! : ip;
  if (candidate.includes('.') && !candidate.includes(':')) {
    const bytes = parseIpv4(candidate);
    return bytes ? { family: 4, bytes } : null;
  }
  const bytes = parseIpv6(candidate);
  return bytes ? { family: 6, bytes } : null;
}

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    bytes.push(value);
  }
  return bytes;
}

function parseIpv6(ip: string): number[] | null {
  if (!ip.includes(':')) return null;
  const [head, tail = ''] = ip.split('::');
  if (ip.split('::').length > 2) return null;
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  if (missing < 0 || (missing > 0 && !ip.includes('::'))) return null;
  const groups = [
    ...headGroups,
    ...Array.from({ length: missing }, () => '0'),
    ...tailGroups,
  ];
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{0,4}$/i.test(group)) return null;
    const value = Number.parseInt(group || '0', 16);
    bytes.push((value >> 8) & 0xff, value & 0xff);
  }
  return bytes;
}

function matchesCidr(ip: NormalizedIp, cidr: string): boolean {
  const [network, prefixRaw] = cidr.split('/');
  if (!network) return false;
  const networkIp = normalizeIp(network);
  if (!networkIp || networkIp.family !== ip.family) return false;
  const maxBits = ip.family === 4 ? 32 : 128;
  const prefix = prefixRaw === undefined ? maxBits : Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxBits) return false;

  let bitsLeft = prefix;
  for (let i = 0; i < ip.bytes.length && bitsLeft > 0; i += 1) {
    const bits = Math.min(8, bitsLeft);
    const mask = (0xff << (8 - bits)) & 0xff;
    if (((ip.bytes[i]! ^ networkIp.bytes[i]!) & mask) !== 0) return false;
    bitsLeft -= bits;
  }
  return true;
}
