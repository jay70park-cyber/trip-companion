// Shared with the app (index.html has the same two functions): what is spoken for a stop, and its hash.
export function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
export function spoken(s, l) {
  const name = (s.name && (s.name[l] || s.name.en)) || "";
  const text = (s.text && s.text[l]) || "";
  return text ? `${name}. ${text}` : "";
}
