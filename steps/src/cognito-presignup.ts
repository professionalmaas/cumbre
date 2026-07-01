import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminLinkProviderForUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { log } from "./lib/log";

interface PreSignUpEvent {
  triggerSource: string;
  userPoolId: string;
  userName: string;
  request: { userAttributes: Record<string, string> };
  response: { autoConfirmUser?: boolean; autoVerifyEmail?: boolean };
}

const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

// Prevents duplicate accounts when the same email signs up once via password and once via a
// federated IdP (Google). Fires on PreSignUp_ExternalProvider — the one point in the Cognito
// lifecycle where AdminLinkProviderForUser can still succeed, because the federated identity
// hasn't finished its own sign-up yet. By PostConfirmation it already exists as a separate
// user and linking requires delete+relink instead (see AWS: "Linking federated users to an
// existing user profile"). Never throws — a linking failure just falls through to Cognito's
// default behavior (a second identity, same as before this trigger existed).
export async function handler(event: PreSignUpEvent): Promise<PreSignUpEvent> {
  if (event.triggerSource !== "PreSignUp_ExternalProvider") return event;

  const email = event.request.userAttributes.email;
  const emailVerified = event.request.userAttributes.email_verified;
  if (!email || emailVerified !== "true") return event;

  const sep = event.userName.indexOf("_");
  if (sep === -1) return event;
  const providerName = event.userName.slice(0, sep);
  const providerSub = event.userName.slice(sep + 1);

  try {
    const found = await client.send(
      new ListUsersCommand({
        UserPoolId: event.userPoolId,
        Filter: `email = "${email.replace(/"/g, '\\"')}"`,
        Limit: 10,
      })
    );

    // Only link to an existing CONFIRMED native (password) user — never chain onto another
    // federated identity, and never link to an incomplete signup.
    const nativeUser = found.Users?.find((u) => u.UserStatus === "CONFIRMED" && u.Username && !u.Username.includes("_"));
    if (!nativeUser?.Username) return event;

    await client.send(
      new AdminLinkProviderForUserCommand({
        UserPoolId: event.userPoolId,
        DestinationUser: { ProviderName: "Cognito", ProviderAttributeValue: nativeUser.Username },
        SourceUser: {
          ProviderName: providerName,
          ProviderAttributeName: "Cognito_Subject",
          ProviderAttributeValue: providerSub,
        },
      })
    );

    log("info", "presignup.linked", { email, provider: providerName, destination: nativeUser.Username });
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = true;
  } catch (err) {
    log("warn", "presignup.link_failed", { email, error: err instanceof Error ? err.message : String(err) });
  }

  return event;
}
