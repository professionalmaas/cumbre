// Bundle each step handler to dist/<name>/index.js (CommonJS) with `handler` exported.
// Terraform zips dist/<name> per Lambda. pg is bundled (no native deps for the JS client).
import { build } from "esbuild";
import { mkdirSync } from "fs";

const STEPS = ["validate", "moderate", "fingerprint", "charge", "deliver", "reject", "review", "fail"];

// Cognito Lambda triggers (PreSignUp account-linking, CUSTOM_AUTH magic-link challenge flow).
// Same bundling pipeline; kept in a separate list so Terraform's SFN step-name loop doesn't
// pick these up as analyze-loop steps.
const COGNITO_TRIGGERS = ["cognito-presignup", "cognito-define-auth", "cognito-create-auth", "cognito-verify-auth"];

for (const name of [...STEPS, ...COGNITO_TRIGGERS]) {
  mkdirSync(`dist/${name}`, { recursive: true });
  await build({
    entryPoints: [`src/${name}.ts`],
    outfile: `dist/${name}/index.js`,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    sourcemap: false,
    minify: false,
    // Bundle everything (incl. the AWS SDK + pg) so each Lambda zip is self-contained
    // and independent of the runtime's bundled SDK version.
  });
  console.log(`built dist/${name}/index.js`);
}
