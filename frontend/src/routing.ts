export function safeDestination(
  value: unknown,
  fallback = "/account/profile",
): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return fallback;
  const url = new URL(value, "https://quickkart.invalid");
  if (
    url.origin !== "https://quickkart.invalid" ||
    ["/login", "/register", "/verify-email"].includes(url.pathname)
  )
    return fallback;
  return url.pathname + url.search + url.hash;
}
