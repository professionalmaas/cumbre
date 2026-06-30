import { headers } from 'next/headers'
import Script from 'next/script'

// Server component: reads the nonce that middleware.ts places on x-nonce
// and threads it into the inline RUM bootstrap so it passes the nonce CSP.
export function RumSnippet() {
  const appMonitorId = process.env.NEXT_PUBLIC_RUM_APP_MONITOR_ID
  const identityPoolId = process.env.NEXT_PUBLIC_RUM_IDENTITY_POOL_ID
  const region = process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1'

  if (!appMonitorId || !identityPoolId) return null

  // headers() is synchronous in Next.js 14 (async in 15+).
  const nonce = headers().get('x-nonce') ?? undefined

  const config = JSON.stringify({
    sessionSampleRate: 1,
    identityPoolId,
    endpoint: `https://dataplane.rum.${region}.amazonaws.com`,
    telemetries: ['performance', 'errors', 'http'],
    allowCookies: true,
    enableXRay: true,
  })

  return (
    <Script id="cwr-rum" strategy="afterInteractive" nonce={nonce}>{`
(function(n,i,v,r,s,c,u,x,z){x=window;z=document;u='script';x[n]={q:[]};
x[n]['_cfg']=${config};
x[n]['_cfgIds']=['${appMonitorId}'];
c=z.createElement(u);c.src=r;c.async=1;z.getElementsByTagName(u)[0].before(c);
}('cwr','0','1.0.0','https://client.rum.${region}.amazonaws.com/1.0.2/cwr.js'));
`}</Script>
  )
}
