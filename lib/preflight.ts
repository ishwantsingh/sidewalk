// Error messages from SDKs can contain request URLs or credentials. Print fixed categories only.
export function safeError(error: unknown) {
  const e = error as {
    status?: number;
    statusCode?: number;
    body?: { error?: { message?: string } };
    code?: string;
    cause?: { code?: string };
    message?: string;
  };
  const message = e.message ?? "";
  const status =
    e.status ?? e.statusCode ?? message.match(/Provider HTTP (\d+)/)?.[1];
  if (
    message === "Places API (New) disabled" ||
    message ===
      "Resend key is send-only; full access required for domain verification"
  )
    return message;
  if (/^Schema unavailable: (?:[a-z_]+(?:, )?)+$/.test(message)) return message;
  if (
    status === 403 &&
    e.body?.error?.message?.includes("company:balance:read")
  )
    return "Provider HTTP 403: Whop key missing company:balance:read scope";
  if (status) return `Provider HTTP ${status}`;
  const code = e.cause?.code ?? e.code;
  if (code && /^[A-Z0-9_]+$/.test(code)) return code;
  if (/executable.*doesn.t exist/i.test(message))
    return "Chromium missing; install Playwright Chromium";
  if (/oauth|authorization|unauthorized/i.test(message))
    return "OAuth authorization failed; reconnect Lovable";
  if (/Geocoding status: [A-Z_]+/.test(message))
    return message.match(/Geocoding status: [A-Z_]+/)![0];
  if (/Missing (?:Terac )?tool [a-z_]+/.test(message))
    return message.match(/Missing (?:Terac )?tool [a-z_]+/)![0];
  if (
    code === undefined &&
    /schema cache|does not exist|Could not find/.test(message)
  )
    return "Required database schema is missing or inaccessible";
  return "Check failed (provider details withheld to protect secrets)";
}
