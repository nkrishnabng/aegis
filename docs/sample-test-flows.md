# Sample Test Flows

A quick, working walkthrough using a public QA practice site, so you can try the whole
loop end-to-end before pointing the tool at your own application.

## 1. Create a project

- Project name: `Demo login flow`
- Target URL: `https://the-internet.herokuapp.com/login`

(Running `npm run seed` from `packages/backend` creates this project for you
automatically.)

## 2. Generate test cases via chat

Type in the chat panel:

> Generate test cases for the login page

**What happens:** the agent calls `browser_navigate` to load the page, `browser_snapshot`
to read the real form (it will see a `textbox "Username"`, `textbox "Password"`, and a
`button "Login"`), then calls `propose_test_cases` with something like:

```json
{
  "title": "Successful login with valid credentials",
  "objective": "Verify a user can log in with valid credentials",
  "preconditions": "User is on the login page and logged out",
  "testData": { "username": "tomsmith", "password": "SuperSecretPassword!" },
  "expectedResult": "User sees the secure area with a success message",
  "priority": "high",
  "type": "smoke",
  "steps": [
    { "order": 1, "action": "navigate", "value": "https://the-internet.herokuapp.com/login", "description": "Open the login page" },
    { "order": 2, "action": "fill", "selector": { "strategy": "label", "label": "Username", "description": "Username field" }, "value": "tomsmith", "description": "Enter username" },
    { "order": 3, "action": "fill", "selector": { "strategy": "label", "label": "Password", "description": "Password field" }, "value": "SuperSecretPassword!", "description": "Enter password" },
    { "order": 4, "action": "click", "selector": { "strategy": "role", "role": "button", "name": "Login", "description": "Login button" }, "description": "Submit the form" },
    { "order": 5, "action": "assertText", "value": "You logged into a secure area", "description": "Verify success message" }
  ]
}
```

This appears immediately in the **Test cases** panel with status `draft`.

## 3. Ask for a negative test

> Test an invalid password

The agent reuses what it already knows about the page and proposes a second test case
(type `negative`) that submits a wrong password and asserts the "invalid" error message
appears instead.

## 4. Edit via chat

> Change the valid-login test's username to "invalidUser" and mark it as a regression test

The agent calls `update_test_case` with just the changed fields, and the card updates
live in the UI.

## 5. Run it

Click **Run** on a test case. The executor spins up an isolated Playwright MCP browser
session, replays each step (re-resolving selectors against a fresh page snapshot each
time), captures a screenshot per step, and lands you on the **Run dashboard**:
per-step pass/fail, screenshots, execution logs, and -- on failure -- a plain-language
explanation plus a suggested fix.

## 6. Rerun and export

- If a step fails (e.g. the page changed), hit **Rerun test** after fixing the step (or
  let the agent's selector-recovery kick in automatically for minor changes).
- Click **Export as Playwright script** on the test case editor to download a standalone
  `.spec.ts` file using `getByRole`/`getByLabel`/etc. locators, runnable with
  `npx playwright test` completely independent of this tool.

## 7. Regression tests for registration

> Create regression tests for user registration

Point a new project at your own app's `/register` (or `/signup`) page and repeat --
the agent inspects whatever form fields actually exist rather than assuming a fixed
template.
