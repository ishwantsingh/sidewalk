import { env } from "./config";

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(env("APP_URL")).origin;
}
