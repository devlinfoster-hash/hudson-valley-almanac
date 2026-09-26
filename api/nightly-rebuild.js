// Nightly rebuild, called by the Vercel cron in vercel.json. Scheduled News
// posts only appear after a rebuild on or after their publish_date, so this
// POSTs to the production deploy hook once a day.
//
// Vercel sends `Authorization: Bearer $CRON_SECRET` on cron invocations; any
// other caller is rejected so the hook can't be triggered from outside.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const hook = process.env.DEPLOY_HOOK_URL;
  if (!hook) {
    console.error("[nightly-rebuild] DEPLOY_HOOK_URL is not set.");
    return new Response("DEPLOY_HOOK_URL is not set", { status: 500 });
  }

  const res = await fetch(hook, { method: "POST" });
  if (!res.ok) {
    console.error(`[nightly-rebuild] Deploy hook returned ${res.status}.`);
    return new Response(`Deploy hook returned ${res.status}`, { status: 502 });
  }
  return Response.json({ triggered: true });
}
