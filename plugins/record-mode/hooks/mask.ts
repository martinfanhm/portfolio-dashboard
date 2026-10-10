const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g

// Well-known key shapes: Anthropic/OpenAI, GitHub, Slack, AWS, Google, GitLab, Stripe.
const KEY =
  /\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{16,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|glpat-[A-Za-z0-9_-]{20,}|(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,})\b/g

// A value after a key-ish name: `API_KEY=...`, `"token": "..."`, `Authorization: Bearer ...`.
const ASSIGNED =
  /\b((?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|apikey|token|secret|password|passwd|bearer)["']?\s*[:=]?\s*["']?(?:Bearer\s+)?)([A-Za-z0-9._~+/=-]{12,})/gi

// 8 to 15 digits in phone-like groups, optionally +country and (area); never part of a longer word or number.
const PHONE =
  /(?<![\w.+-])(?:\+\d{1,3}[\s-]?)?(?:\(\d{1,4}\)[\s-]?)?(?:\d{2,4}[\s-]?)?\d{3,4}[\s-]?\d{3,4}(?![\w.-])/g

export function maskText(text: string): string {
  return text
    .replace(KEY, '[API key]')
    .replace(ASSIGNED, (_all, label: string) => `${label}[API key]`)
    .replace(EMAIL, '[email]')
    .replace(PHONE, all => {
      const digits = all.replace(/\D/g, '').length
      return digits >= 8 && digits <= 15 ? '[電話]' : all
    })
}

/** Masks every string inside a plain-data value, keeping its shape. */
export function maskDeep<T>(value: T): T {
  if (typeof value === 'string') return maskText(value) as T
  if (Array.isArray(value)) return value.map(maskDeep) as T
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskDeep(v)])) as T
  }
  return value
}
