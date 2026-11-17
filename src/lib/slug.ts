const TURKISH_CHARS: Record<string, string> = {
  ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u',
  Ç: 'c', Ğ: 'g', I: 'i', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u',
};

/** "Kuaför Ayşe & Çiğdem" -> "kuafor-ayse-cigdem" */
export function slugify(text: string): string {
  return text
    .replace(/[çğıiöşüÇĞIİÖŞÜ]/g, (ch) => TURKISH_CHARS[ch] ?? ch)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
