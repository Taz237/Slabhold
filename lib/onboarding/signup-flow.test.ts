import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TAKEN_USERNAME } from "@/lib/social/username-taken";
import {
  SIGNUP_STEPS,
  displayNameFor,
  nextSignupStep,
  openMailTarget,
  passwordStrength,
  previousSignupStep,
  signupProgress,
  signupStepBlocked,
  stepForSignupError,
} from "./signup-flow";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";

const filled = {
  email: "ada@example.com",
  password: "secret12",
  username: "wax_room",
  displayName: "Ada",
};

describe("sign-up steps", () => {
  it("goes email, password, username, display name, then submits", () => {
    assert.deepEqual([...SIGNUP_STEPS], ["email", "password", "username", "name"]);
    assert.equal(nextSignupStep("email"), "password");
    assert.equal(nextSignupStep("password"), "username");
    assert.equal(nextSignupStep("username"), "name");
    assert.equal(nextSignupStep("name"), "submit");
  });

  it("goes back one step at a time and leaves from the first", () => {
    assert.equal(previousSignupStep("name"), "username");
    assert.equal(previousSignupStep("username"), "password");
    assert.equal(previousSignupStep("password"), "email");
    assert.equal(previousSignupStep("email"), "exit");
  });

  it("fills the progress bar a quarter per step", () => {
    assert.equal(signupProgress("email"), 0.25);
    assert.equal(signupProgress("password"), 0.5);
    assert.equal(signupProgress("username"), 0.75);
    assert.equal(signupProgress("name"), 1);
  });

  it("blocks each step with the same rules as the server", () => {
    assert.equal(signupStepBlocked("email", { ...filled, email: "nope" }, "available"), "Enter a valid email.");
    assert.equal(signupStepBlocked("email", filled, "available"), null);
    assert.equal(signupStepBlocked("password", { ...filled, password: "12345" }, "available"), "Use at least 6 characters.");
    assert.equal(signupStepBlocked("password", filled, "available"), null);
    assert.match(signupStepBlocked("username", { ...filled, username: "a!" }, "available") ?? "", /3–20/);
    assert.equal(signupStepBlocked("username", { ...filled, username: "admin" }, "available"), TAKEN_USERNAME);
    assert.equal(signupStepBlocked("username", filled, "taken"), TAKEN_USERNAME);
    assert.equal(signupStepBlocked("username", filled, "checking"), "Checking that username…");
    assert.equal(signupStepBlocked("username", filled, "available"), null);
    // A failed lookup does not trap anyone. The server still checks on submit.
    assert.equal(signupStepBlocked("username", filled, "unknown"), null);
    assert.equal(signupStepBlocked("name", { ...filled, displayName: "" }, "available"), null);
    assert.equal(signupStepBlocked("name", { ...filled, displayName: "x".repeat(51) }, "available"), "Keep it under 50 characters.");
  });

  it("prefills the display name from the username until it is edited", () => {
    assert.equal(displayNameFor({ current: "", username: "Wax_Room", edited: false }), "wax_room");
    assert.equal(displayNameFor({ current: "old", username: "new_name", edited: false }), "new_name");
    assert.equal(displayNameFor({ current: "Ada Chen", username: "wax_room", edited: true }), "Ada Chen");
    assert.equal(displayNameFor({ current: "", username: "wax_room", edited: true }), "");
  });

  it("sends a server error back to the step that can fix it", () => {
    assert.equal(stepForSignupError(TAKEN_USERNAME), "username");
    assert.equal(stepForSignupError("Usernames are 3–20 characters: letters, numbers, underscores."), "username");
    assert.equal(stepForSignupError("Enter a valid email."), "email");
    assert.equal(stepForSignupError("That email is already in use."), "email");
    assert.equal(stepForSignupError("Unable to validate email address: invalid format"), "email");
    assert.equal(stepForSignupError("Use at least 6 characters."), "password");
    assert.equal(stepForSignupError("Password should be at least 6 characters."), "password");
    assert.equal(stepForSignupError("Please complete the check and try again."), null);
    assert.equal(stepForSignupError("email rate limit exceeded"), null);
  });
});

describe("password strength hint", () => {
  it("gives a plain hint, never a score", () => {
    assert.deepEqual(passwordStrength(""), { level: "empty", label: "At least 6 characters." });
    assert.deepEqual(passwordStrength("abc12"), { level: "short", label: "Too short. Use at least 6 characters." });
    assert.deepEqual(passwordStrength("abcdef"), { level: "okay", label: "Okay. Longer is stronger." });
    assert.deepEqual(passwordStrength("abcdefgh12"), { level: "good", label: "Good." });
    assert.deepEqual(passwordStrength("Card-Show-2026!"), { level: "strong", label: "Strong." });
  });
});

describe("open mail", () => {
  it("opens the Mail app on iPhone", () => {
    assert.deepEqual(openMailTarget("ada@example.com", IPHONE), { href: "message://", label: "Open Mail", external: false });
  });

  it("opens webmail for big providers elsewhere", () => {
    assert.deepEqual(openMailTarget("ada@gmail.com", ANDROID), {
      href: "https://mail.google.com/mail/u/0/#inbox",
      label: "Open Gmail",
      external: true,
    });
    assert.equal(openMailTarget("ada@hotmail.com", ANDROID)?.href, "https://outlook.live.com/mail/0/inbox");
    assert.equal(openMailTarget("ada@outlook.com", ANDROID)?.label, "Open Outlook");
    assert.equal(openMailTarget("ada@yahoo.com", ANDROID)?.label, "Open Yahoo Mail");
    assert.equal(openMailTarget("ada@icloud.com", ANDROID)?.href, "https://www.icloud.com/mail");
  });

  it("falls back to a mailto hint for anything else", () => {
    assert.deepEqual(openMailTarget("ada@example.com", ANDROID), { href: "mailto:", label: "Open your email app", external: false });
    assert.deepEqual(openMailTarget("", ""), { href: "mailto:", label: "Open your email app", external: false });
  });
});
