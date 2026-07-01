import { log } from "./lib/log";

interface ChallengeAttempt {
  challengeName: string;
  challengeResult: boolean;
}

interface DefineAuthChallengeEvent {
  userName: string;
  request: { session: ChallengeAttempt[]; userNotFound?: boolean };
  response: { challengeName?: string; issueTokens?: boolean; failAuthentication?: boolean };
}

const MAX_ATTEMPTS = 3;

// Drives the CUSTOM_AUTH state machine for magic-link sign-in: issue one CUSTOM_CHALLENGE,
// issue tokens once it's answered correctly, cap retries, never issue tokens for an unknown
// user (the caller is expected to pre-create the user server-side before InitiateAuth).
export async function handler(event: DefineAuthChallengeEvent): Promise<DefineAuthChallengeEvent> {
  const session = event.request.session;

  if (event.request.userNotFound) {
    event.response.failAuthentication = true;
    event.response.issueTokens = false;
    return event;
  }

  const last = session[session.length - 1];

  if (session.length === 0) {
    event.response.challengeName = "CUSTOM_CHALLENGE";
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
  } else if (last.challengeName === "CUSTOM_CHALLENGE" && last.challengeResult === true) {
    event.response.issueTokens = true;
    event.response.failAuthentication = false;
  } else if (session.length >= MAX_ATTEMPTS) {
    log("warn", "magic_link.max_attempts", { userName: event.userName, attempts: session.length });
    event.response.failAuthentication = true;
    event.response.issueTokens = false;
  } else {
    event.response.challengeName = "CUSTOM_CHALLENGE";
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
  }

  return event;
}
