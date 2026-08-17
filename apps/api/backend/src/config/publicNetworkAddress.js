import dns from "node:dns";
import net from "node:net";

function parseIpv4(value) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) return null;
  return octets.reduce((address, octet) => (address << 8n) | BigInt(octet), 0n);
}

function parseIpv6(value) {
  if (!value || value.includes("%") || value.indexOf("::") !== value.lastIndexOf("::")) return null;
  let source = value;
  if (source.includes(".")) {
    const separator = source.lastIndexOf(":");
    const ipv4 = separator >= 0 ? parseIpv4(source.slice(separator + 1)) : null;
    if (ipv4 === null) return null;
    source = `${source.slice(0, separator)}:${(ipv4 >> 16n).toString(16)}:${(ipv4 & 0xffffn).toString(16)}`;
  }

  const compressed = source.includes("::");
  const [leftSource, rightSource = ""] = source.split("::");
  const left = leftSource ? leftSource.split(":") : [];
  const right = rightSource ? rightSource.split(":") : [];
  const validGroup = (group) => /^[0-9a-f]{1,4}$/i.test(group);
  if (left.some((group) => !validGroup(group)) || right.some((group) => !validGroup(group))) return null;
  if ((!compressed && left.length !== 8) || (compressed && left.length + right.length >= 8)) return null;

  const groups = compressed
    ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
    : left;
  return groups.reduce((address, group) => (address << 16n) | BigInt(`0x${group}`), 0n);
}

function matchesPrefix(address, prefix, bits, width) {
  const shift = BigInt(width - bits);
  return (address >> shift) === (prefix >> shift);
}

function ipv4(value) {
  const parsed = parseIpv4(value);
  if (parsed === null) throw new Error(`Invalid IPv4 prefix: ${value}`);
  return parsed;
}

function ipv6(value) {
  const parsed = parseIpv6(value);
  if (parsed === null) throw new Error(`Invalid IPv6 prefix: ${value}`);
  return parsed;
}

const UNSAFE_IPV4_PREFIXES = Object.freeze([
  [ipv4("0.0.0.0"), 8],
  [ipv4("10.0.0.0"), 8],
  [ipv4("100.64.0.0"), 10],
  [ipv4("127.0.0.0"), 8],
  [ipv4("169.254.0.0"), 16],
  [ipv4("172.16.0.0"), 12],
  [ipv4("192.0.0.0"), 24],
  [ipv4("192.0.2.0"), 24],
  [ipv4("192.88.99.0"), 24],
  [ipv4("192.168.0.0"), 16],
  [ipv4("198.18.0.0"), 15],
  [ipv4("198.51.100.0"), 24],
  [ipv4("203.0.113.0"), 24],
  [ipv4("224.0.0.0"), 4],
  [ipv4("240.0.0.0"), 4],
]);

const UNSAFE_IPV6_PREFIXES = Object.freeze([
  [ipv6("::"), 128],
  [ipv6("::1"), 128],
  [ipv6("::ffff:0:0"), 96],
  [ipv6("64:ff9b::"), 96],
  [ipv6("64:ff9b:1::"), 48],
  [ipv6("100::"), 64],
  [ipv6("2001::"), 32],
  [ipv6("2001:2::"), 48],
  [ipv6("2001:10::"), 28],
  [ipv6("2001:20::"), 28],
  [ipv6("2001:db8::"), 32],
  [ipv6("2002::"), 16],
  [ipv6("3fff::"), 20],
  [ipv6("5f00::"), 16],
  [ipv6("fc00::"), 7],
  [ipv6("fe80::"), 10],
  [ipv6("ff00::"), 8],
]);

export function isUnsafePublicDestinationHostname(value) {
  const hostname = String(value || "").trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return true;

  const ipv4Address = parseIpv4(hostname);
  if (ipv4Address !== null) {
    return UNSAFE_IPV4_PREFIXES.some(([prefix, bits]) => matchesPrefix(ipv4Address, prefix, bits, 32));
  }
  if (/^[\d.]+$/.test(hostname)) return true;

  const ipv6Address = parseIpv6(hostname);
  if (ipv6Address !== null) {
    return UNSAFE_IPV6_PREFIXES.some(([prefix, bits]) => matchesPrefix(ipv6Address, prefix, bits, 128));
  }
  return hostname.includes(":");
}

export function assertPublicNetworkAddresses(addresses) {
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error("Public DNS resolution failed");
  }
  const normalized = addresses.map((entry) => {
    const address = typeof entry === "string" ? entry : entry?.address;
    const family = net.isIP(address);
    const declaredFamily = typeof entry === "string" ? family : Number(entry?.family || family);
    if (!address || family === 0 || declaredFamily !== family || isUnsafePublicDestinationHostname(address)) {
      throw new Error("Destination DNS resolution is not public");
    }
    return { address, family };
  });
  return normalized;
}

export function createPublicNetworkLookup(resolver = dns.lookup) {
  return function publicNetworkLookup(hostname, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    const requested = typeof options === "number" ? { family: options } : { ...(options || {}) };
    const literalFamily = net.isIP(hostname);
    if (literalFamily) {
      try {
        const [result] = assertPublicNetworkAddresses([{ address: hostname, family: literalFamily }]);
        if (requested.all) callback(null, [result]);
        else callback(null, result.address, result.family);
      } catch {
        callback(new Error("Destination DNS resolution is not public"));
      }
      return;
    }

    resolver(hostname, { ...requested, all: true }, (error, results) => {
      if (error) {
        callback(new Error("Public DNS resolution failed"));
        return;
      }
      try {
        let validated = assertPublicNetworkAddresses(results);
        if (requested.family === 4 || requested.family === 6) {
          validated = validated.filter(({ family }) => family === requested.family);
          if (validated.length === 0) throw new Error("Public DNS resolution failed");
        }
        if (requested.all) callback(null, validated);
        else callback(null, validated[0].address, validated[0].family);
      } catch (validationError) {
        callback(new Error(validationError.message));
      }
    });
  };
}
